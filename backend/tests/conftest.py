"""Fixtures bersama untuk test backend MileAI."""

from __future__ import annotations

import pytest

import config


@pytest.fixture
def db(tmp_path, monkeypatch):
    """SQLite terisolasi di tmp_path; tidak menyentuh backend/mileai.db asli."""
    import db as db_module

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "mileai-test.db"))
    db_module.init_db()
    return db_module


@pytest.fixture
def fake_client():
    from tests.fakes import FakeClient

    return FakeClient()


@pytest.fixture
def stub_llm(monkeypatch):
    """Helper patch ai.verify_llm -> (confidence, reason), atau raise exc."""
    import ai as ai_module

    def _make(confidence, reason=None, exc=None):
        def _verify(requirement, proof):
            if exc is not None:
                raise exc
            return confidence, reason

        monkeypatch.setattr(ai_module, "verify_llm", _verify)
        return _verify

    return _make


@pytest.fixture
def api(tmp_path, monkeypatch):
    """TestClient FastAPI dengan chain di-stub (FakeClient) + DB tmp.

    Menghilangkan ketergantungan ke anvil/RPC nyata: ContractClient di main.py
    di-patch agar mengembalikan FakeClient. Polling dibuat inert
    (poll_count_override=0) supaya tidak menulis DB di tengah tes.
    """
    import db as db_module
    import main as main_module
    from fastapi.testclient import TestClient
    from tests.fakes import FakeClient

    monkeypatch.setattr(config, "DB_PATH", str(tmp_path / "api.db"))
    monkeypatch.setattr(config, "POLL_INTERVAL_SECONDS", 3600.0)
    db_module.init_db()  # schema siap sebelum tes main menulis verifications

    client = FakeClient()
    client.poll_count_override = 0
    monkeypatch.setattr(main_module, "ContractClient", lambda *a, **k: client)

    return {"app": main_module.app, "client": client, "TestClient": TestClient}