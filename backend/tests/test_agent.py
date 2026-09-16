"""Unit test AIAgent (agent.py): keputusan verifikasi tiga tier, idempotency
guard, sanity guard wiring, dan error handling. LLM di-stub, chain di-stub
(FakeClient) — tidak ada panggilan API/RPC asli."""

from __future__ import annotations

import pytest

import ai as ai_module
import config
from tests.fakes import FakeClient

LONG_PROOF = "kata " * 40  # panjang >= PROOF_MIN_LEN_FOR_HIGH_SCORE


@pytest.fixture
def agent_(fake_client, db):
    import agent as agent_module

    return agent_module.AIAgent(fake_client)


def seed_submitted(fake_client: FakeClient, escrow_id=0, milestone_index=0,
                   proof=LONG_PROOF, amount=100 * 10**18):
    fake_client.add_escrow(escrow_id, "0xpayer", "0xrecipient", "0xtoken",
                           milestone_index + 1)
    fake_client.add_milestone(escrow_id, milestone_index, amount,
                              "kriteria milestone lengkap", proof,
                              config.STATUS_SUBMITTED)


class TestKeputusanTier:
    def test_conf_tinggi_memicu_auto_release(self, agent_, fake_client, stub_llm, db):
        seed_submitted(fake_client)
        stub_llm(95, "bukti lengkap dan valid")
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "verified_auto"
        assert res["confidence"] == 95 and res["tx_hash"]
        assert fake_client.milestones[(0, 0)]["status"] == config.STATUS_RELEASED
        assert fake_client.released == [(0, 0)]
        row = db.get_verification(0, 0)
        assert row["action"] == "verified_auto" and row["tx_hash"] == res["tx_hash"]

    def test_conf_50_84_button_review_manual(self, agent_, fake_client, stub_llm):
        seed_submitted(fake_client)
        stub_llm(63, "bukti agak buram")
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "manual_review"
        assert res["confidence"] == 63 and res["tx_hash"] is None
        assert fake_client.released == []
        assert fake_client.milestones[(0, 0)]["status"] == config.STATUS_SUBMITTED

    def test_conf_di_bawah_50_insufficient(self, agent_, fake_client, stub_llm):
        seed_submitted(fake_client)
        stub_llm(30, "bukti tidak menjawab kriteria")
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "insufficient"
        assert res["tx_hash"] is None and fake_client.released == []


class TestIdempotencyGuard:
    def test_status_onchain_bukan_submitted_skip_tanpa_llm(
            self, agent_, fake_client, monkeypatch, db):
        fake_client.add_escrow(0, "0xp", "0xr", "0xt", 1)
        fake_client.add_milestone(0, 0, 100, "req", "x", config.STATUS_RELEASED)
        called = []
        monkeypatch.setattr(
            ai_module, "verify_llm",
            lambda rq, pf: called.append(1) or (100, "x"),
        )

        res = agent_.verify_one(0, 0, forced=True)
        assert res.get("skipped")
        assert called == []            # LLM tidak dipanggil
        assert fake_client.released == []  # tidak ada tx

    def test_bukti_sama_skip_saat_not_forced(self, agent_, fake_client, monkeypatch,
                                             db):
        seed_submitted(fake_client, proof=LONG_PROOF)
        db.upsert_verification(0, 0, "verified_auto", confidence=88,
                               proof_text=LONG_PROOF, tx_hash="0xsebelum")
        called = []
        monkeypatch.setattr(
            ai_module, "verify_llm",
            lambda rq, pf: called.append(1) or (90, "x"),
        )

        res = agent_.verify_one(0, 0, forced=False)
        assert res.get("skipped")
        assert called == []  # bukti sama + hasil final -> tidak spam LLM

        # Tapi forced=True (trigger manual) boleh menilai ulang walau bukti sama
        res2 = agent_.verify_one(0, 0, forced=True)
        assert res2["action"] == "verified_auto"
        assert called == [1]

    def test_bukti_berubah_dinilai_ulang(self, agent_, fake_client, monkeypatch, db):
        seed_submitted(fake_client, proof="bukti versi 1")
        db.upsert_verification(0, 0, "insufficient", confidence=20,
                               proof_text="bukti versi 1")
        # Bukti di-on-chain berubah -> wajib dinilai ulang walau result lama ada
        fake_client.milestones[(0, 0)]["proof_text"] = "bukti versi 2 (jauh lebih lengkap)"
        called = []
        monkeypatch.setattr(
            ai_module, "verify_llm",
            lambda rq, pf: called.append(1) or (92, "horay"),
        )
        res = agent_.verify_one(0, 0, forced=False)
        assert res["action"] == "verified_auto"
        assert called == [1]


class TestSanityGuardWiring:
    def test_conf_100_bukti_pendek_diturunkan_ke_review_manual(
            self, agent_, fake_client, stub_llm, db):
        seed_submitted(fake_client, proof="selesai")
        stub_llm(100, "sempurna")
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "manual_review"
        assert "sanity" in res["reason"].lower()
        assert res["tx_hash"] is None and fake_client.released == []
        row = db.get_verification(0, 0)
        assert row["action"] == "manual_review"
        # status on-chain tetap Submitted
        assert fake_client.milestones[(0, 0)]["status"] == config.STATUS_SUBMITTED


class TestErrorHandling:
    def test_llm_error_menjadi_action_error(self, agent_, fake_client, stub_llm, db):
        seed_submitted(fake_client)
        stub_llm(0, exc=ValueError("LLM_API_KEY belum diisi di .env"))
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "error"
        assert res["tx_hash"] is None and fake_client.released == []
        row = db.get_verification(0, 0)
        assert row["action"] == "error"

    def test_auto_release_gagal_jatuh_ke_review_manual(
            self, agent_, fake_client, stub_llm, db):
        seed_submitted(fake_client)
        fake_client.fail_auto_release = True
        stub_llm(95, "AI yakin")
        res = agent_.verify_one(0, 0, forced=True)
        assert res["action"] == "manual_review"
        assert "gagal" in res["reason"].lower()
        assert res["tx_hash"] is None and fake_client.released == []
        row = db.get_verification(0, 0)
        assert row["action"] == "manual_review"

    def test_milestone_tidak_ada_raises(self, agent_, fake_client, stub_llm):
        stub_llm(90, "x")
        with pytest.raises(ValueError):
            agent_.verify_one(9, 0, forced=True)


class TestPollOnce:
    def test_hanya_milestone_submitted_yang_diproses(self, agent_, fake_client,
                                                     stub_llm, db):
        fake_client.add_escrow(0, "0xp", "0xr", "0xt", 2)
        fake_client.add_milestone(0, 0, 100, "req1", LONG_PROOF,
                                  config.STATUS_SUBMITTED)
        fake_client.add_milestone(0, 1, 50, "req2", LONG_PROOF,
                                  config.STATUS_RELEASED)
        stub_llm(40, "lemah")
        results = agent_.poll_once()
        assert len(results) == 1
        assert results[0]["action"] == "insufficient"
        assert fake_client.released == []

    def test_escrow_gagal_tidak_menghentikan_siklus(self, agent_, fake_client,
                                                    monkeypatch, db):
        fake_client.add_escrow(0, "0xp", "0xr", "0xt", 1)
        # get_escrow dipaksa gagal HANYA untuk escrow 0
        def _boom(escrow_id):
            if escrow_id == 0:
                raise ValueError("mock")
            return fake_client.escrows[escrow_id]
        monkeypatch.setattr(fake_client, "get_escrow", _boom)
        fake_client.add_escrow(1, "0xp2", "0xr2", "0xt2", 1)
        fake_client.add_milestone(1, 0, 10, "req", LONG_PROOF, config.STATUS_SUBMITTED)

        import ai as ai_module
        monkeypatch.setattr(ai_module, "verify_llm", lambda rq, pf: (85, "ok"))
        results = agent_.poll_once()   # tidak boleh crash walau escrow 0 error
        assert any(r["action"] == "verified_auto" for r in results)


class TestPollLoop:
    """poll_loop(): background loop harus memanggil poll_once berulang dan
    berhenti wajar (CancelledError) — relevan untuk graceful shutdown backend."""

    def test_poll_loop_memanggil_poll_once_berulang_dan_berhenti_dicancel(
            self, agent_, monkeypatch):
        import asyncio
        import agent as agent_module

        calls = {"n": 0}
        original = agent_.poll_once

        def counted_poll_once():
            calls["n"] += 1
            return original()

        monkeypatch.setattr(agent_, "poll_once", counted_poll_once)

        sleeps = {"n": 0}

        async def fake_sleep(_seconds):
            sleeps["n"] += 1
            if sleeps["n"] >= 2:
                raise asyncio.CancelledError()

        monkeypatch.setattr(agent_module.asyncio, "sleep", fake_sleep)

        with pytest.raises(asyncio.CancelledError):
            asyncio.run(agent_.poll_loop())

        # 2 iterasi: poll_once dijalankan 2x, lalu loop dibatalkan via sleep
        assert calls["n"] == 2

    def test_poll_loop_tahan_exception_dari_poll_once(
            self, agent_, monkeypatch):
        import asyncio
        import agent as agent_module

        calls = {"n": 0}

        def flaky():
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("mock gagal sekali")
            return []

        monkeypatch.setattr(agent_, "poll_once", flaky)

        sleeps = {"n": 0}

        async def fake_sleep(_seconds):
            if sleeps["n"] >= 1:
                raise asyncio.CancelledError()
            sleeps["n"] += 1

        monkeypatch.setattr(agent_module.asyncio, "sleep", fake_sleep)

        with pytest.raises(asyncio.CancelledError):
            asyncio.run(agent_.poll_loop())

        # poll_once pertama gagal (exception ditahan), iterasi kedua jalan,
        # lalu loop dimatikan wajar
        assert calls["n"] == 2