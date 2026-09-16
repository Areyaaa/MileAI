"""Integration test main.py pakai FastAPI TestClient.

Chain di-stub lewat fixture `api` (ContractClient -> FakeClient, polling
inert), SQLite di tmp_path. Menguji /health, status viewer (gabungan
on-chain + SQLite), dan /agent/trigger (memanggil process_milestone /
verify_one dengan benar + error yang jelas, bukan 500 tanpa detail)."""

from __future__ import annotations

import pytest

import config
import db as db_module


class TestHealth:
    def test_health_200(self, api):
        with api["TestClient"](api["app"]) as client:
            resp = client.get("/health")
            assert resp.status_code == 200
            body = resp.json()
            assert body["status"] == "ok"
            assert body["contract_connected"] is True
            assert body["agent_configured"] is True
            assert body["polling_active"] is True


class TestStatusViewer:
    def test_status_menggabungkan_onchain_dan_sqlite(self, api):
        fc = api["client"]
        fc.add_escrow(0, "0xpayer", "0xrecipient", "0xtoken", 2)
        fc.add_milestone(0, 0, 100 * 10**18, "Kriteria PR merapikan kode",
                         "bukti: PR #12 digabung, CI lulus", config.STATUS_SUBMITTED)
        db_module.upsert_verification(
            0, 0, "manual_review", confidence=70,
            reason="AI ragu keterkaitan bukti",
            proof_text="bukti: PR #12 digabung, CI lulus",
        )

        with api["TestClient"](api["app"]) as client:
            resp = client.get("/escrows/0/milestones/0/status")
            assert resp.status_code == 200
            body = resp.json()
            # data on-chain (dari mock)
            assert body["onchain_status"] == config.STATUS_SUBMITTED
            assert body["amount"] == 100 * 10**18
            assert "PR #12" in body["proof_text"]
            assert body["payer"] == "0xpayer" and body["recipient"] == "0xrecipient"
            assert body["milestone_count"] == 2
            # hasil verifikasi AI dari SQLite ikut tergabung
            assert body["verification"]["action"] == "manual_review"
            assert body["verification"]["confidence"] == 70
            assert "ragu" in body["verification"]["reason"]
            # status on-chain Submitted + ada verification -> label dari DB
            assert body["display_status"] == "Perlu Review Manual"

    def test_status_milestone_tidak_ada_404_dengan_detail(self, api):
        with api["TestClient"](api["app"]) as client:
            resp = client.get("/escrows/0/milestones/99/status")
            assert resp.status_code == 404
            assert resp.json()["detail"]

    def test_status_escrow_tidak_ada_404_dengan_detail(self, api):
        with api["TestClient"](api["app"]) as client:
            resp = client.get("/escrows/999/milestones/0/status")
            assert resp.status_code == 404
            assert resp.json()["detail"]


class TestAgentTrigger:
    def test_trigger_memanggil_process_milestone_dan_auto_release(self, api, stub_llm):
        fc = api["client"]
        fc.add_escrow(0, "0xpayer", "0xrecipient", "0xtoken", 1)
        fc.add_milestone(0, 0, 50 * 10**18, "kriteria milestone",
                         "bukti yang panjang dan jelas " * 4, config.STATUS_SUBMITTED)
        stub_llm(95, "bukti valid dan lengkap")

        with api["TestClient"](api["app"]) as client:
            resp = client.post("/agent/trigger/0/0")
            assert resp.status_code == 200
            body = resp.json()
            assert body["action"] == "verified_auto"
            assert body["confidence"] == 95
            assert body["tx_hash"]
            assert fc.released == [(0, 0)]
            assert fc.milestones[(0, 0)]["status"] == config.STATUS_RELEASED
            # hasil tersimpan di SQLite (dibaca ulang status viewer)
            row = db_module.get_verification(0, 0)
            assert row and row["action"] == "verified_auto" and row["tx_hash"]

    def test_trigger_conf_review_tidak_kirim_transaksi(self, api, stub_llm):
        fc = api["client"]
        fc.add_escrow(0, "0xpayer", "0xrecipient", "0xtoken", 1)
        fc.add_milestone(0, 0, 1 * 10**18, "kriteria", "bukti agak pendek",
                         config.STATUS_SUBMITTED)
        stub_llm(60, "bukti sedang")

        with api["TestClient"](api["app"]) as client:
            resp = client.post("/agent/trigger/0/0")
            assert resp.status_code == 200
            assert resp.json()["action"] == "manual_review"
            assert fc.released == []

    def test_trigger_milestone_tidak_ditemukan_404_dengan_detail(self, api, stub_llm):
        stub_llm(90, "x")
        with api["TestClient"](api["app"]) as client:
            resp = client.post("/agent/trigger/9/0")
            assert resp.status_code == 404
            detail = resp.json()["detail"]
            assert detail and "luar range" in str(detail)

    def test_trigger_auto_release_gagal_balas_manual_review_bukan_5xx(
            self, api, stub_llm):
        fc = api["client"]
        fc.add_escrow(0, "0xpayer", "0xrecipient", "0xtoken", 1)
        fc.add_milestone(0, 0, 5 * 10**18, "kriteria", "bukti panjang " * 5,
                         config.STATUS_SUBMITTED)
        fc.fail_auto_release = True
        stub_llm(95, "yakin")

        with api["TestClient"](api["app"]) as client:
            resp = client.post("/agent/trigger/0/0")
            # Bukan 500: AI confident tapi tx gagal -> turun ke review manual
            assert resp.status_code == 200
            body = resp.json()
            assert body["action"] == "manual_review"
            assert "gagal" in body["reason"].lower()


class TestAgentTriggerAuth:
    """Saat AGENT_TRIGGER_TOKEN diisi, POST /agent/trigger butuh token."""

    def test_tanpa_token_ditolak_401(self, api, monkeypatch):
        monkeypatch.setattr(config, "AGENT_TRIGGER_TOKEN", "rahasia123")
        with api["TestClient"](api["app"]) as client:
            resp = client.post("/agent/trigger/0/0")
            assert resp.status_code == 401
            assert resp.json()["detail"]

    def test_token_salah_ditolak_401(self, api, monkeypatch):
        monkeypatch.setattr(config, "AGENT_TRIGGER_TOKEN", "rahasia123")
        with api["TestClient"](api["app"]) as client:
            resp = client.post(
                "/agent/trigger/0/0", headers={"Authorization": "Bearer salah"}
            )
            assert resp.status_code == 401

    def test_bearer_token_benar_lolos(self, api, monkeypatch, stub_llm):
        fc = api["client"]
        fc.add_escrow(0, "0xp", "0xr", "0xt", 1)
        fc.add_milestone(0, 0, 1 * 10**18, "krit", "bukti panjang " * 5,
                         config.STATUS_SUBMITTED)
        stub_llm(60, "ok")
        monkeypatch.setattr(config, "AGENT_TRIGGER_TOKEN", "rahasia123")
        with api["TestClient"](api["app"]) as client:
            resp = client.post(
                "/agent/trigger/0/0",
                headers={"Authorization": "Bearer rahasia123"},
            )
            assert resp.status_code == 200
            assert resp.json()["action"] == "manual_review"

    def test_x_agent_token_benar_lolos(self, api, monkeypatch, stub_llm):
        fc = api["client"]
        fc.add_escrow(0, "0xp", "0xr", "0xt", 1)
        fc.add_milestone(0, 0, 1 * 10**18, "krit", "bukti panjang " * 5,
                         config.STATUS_SUBMITTED)
        stub_llm(60, "ok")
        monkeypatch.setattr(config, "AGENT_TRIGGER_TOKEN", "rahasia123")
        with api["TestClient"](api["app"]) as client:
            resp = client.post(
                "/agent/trigger/0/0", headers={"X-Agent-Token": "rahasia123"}
            )
            assert resp.status_code == 200