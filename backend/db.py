"""Lapisan database SQLite: menyimpan hasil verifikasi AI per milestone.

Kenapa SQLite: gratis, tanpa server, cukup untuk MVP. "Proof of work" yang
diverifikasi disimpan snapshot-nya (proof_text) supaya bisa deteksi perubahan
bukti & mencegah eksekusi dobel saat polling berulang.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    escrow_id        INTEGER NOT NULL,
    milestone_index  INTEGER NOT NULL,
    action           TEXT NOT NULL
                     CHECK(action IN ('verified_auto', 'manual_review',
                                      'insufficient', 'error')),
    confidence       INTEGER,
    reason           TEXT,
    proof_text       TEXT,
    tx_hash          TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (escrow_id, milestone_index)
);
"""


def init_db():
    conn = get_conn()
    try:
        with conn:
            conn.execute(SCHEMA)
    finally:
        conn.close()


def get_conn() -> sqlite3.Connection:
    Path(config.DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def upsert_verification(
    escrow_id: int,
    milestone_index: int,
    action: str,
    confidence: int | None = None,
    reason: str | None = None,
    proof_text: str | None = None,
    tx_hash: str | None = None,
) -> None:
    conn = get_conn()
    try:
        with conn:
            conn.execute(
                """
                INSERT INTO verifications
                    (escrow_id, milestone_index, action, confidence, reason,
                     proof_text, tx_hash)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(escrow_id, milestone_index) DO UPDATE SET
                    action=excluded.action,
                    confidence=excluded.confidence,
                    reason=excluded.reason,
                    proof_text=excluded.proof_text,
                    tx_hash=excluded.tx_hash,
                    updated_at=datetime('now')
                """,
                (escrow_id, milestone_index, action, confidence, reason, proof_text, tx_hash),
            )
    finally:
        conn.close()


def get_verification(escrow_id: int, milestone_index: int) -> dict | None:
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM verifications WHERE escrow_id=? AND milestone_index=?",
            (escrow_id, milestone_index),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_all_verifications() -> list[dict]:
    """Semua verdict AI (untuk endpoint batch GET /verify/all).

    Read-only dari SQLite, tanpa RPC — dipakai dashboard frontend supaya
    tidak perlu 1 panggilan HTTP per milestone.
    """
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT escrow_id, milestone_index, action, confidence, reason, "
            "proof_text, tx_hash, updated_at "
            "FROM verifications ORDER BY escrow_id, milestone_index"
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def already_verified_with(escrow_id: int, milestone_index: int, proof_text: str) -> bool:
    """True kalau bukti yang sama sudah pernah dinilai dengan hasil final.

    Bukti yang sama + status final yang sama -> jangan spam LLM tiap siklus
    polling. Bukti berubah / hasil sebelumnya 'error' -> boleh dinilai ulang.
    """
    row = get_verification(escrow_id, milestone_index)
    if not row:
        return False
    if row["action"] == "error":
        return False
    return row.get("proof_text") == proof_text