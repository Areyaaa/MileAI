# Backend MileAI — Dokumentasi

Baca `PRD-MileAI-SoloScope.md` dan `AGENTS.md` untuk konteks. Log kronologis, entri terbaru di atas.

## Log Perubahan

## [2026-09-14 21:30] Backend + AI Agent selesai, smoke test end-to-end vs Anvil lokal

**Apa yang dibuat/diubah:**
- Semua file backend: `config.py`, `db.py`, `ai.py`, `contract_client.py`, `agent.py`, `main.py`, `requirements.txt`, `.env.example` (semua endpoint yang diminta AGENTS.md: `GET /health`, `GET /escrow/{id}/milestones/{index}/status`, `POST /agent/trigger/{escrow_id}/{milestone_index}`).
- Fix `contract_client.py`: `ContractCustomError` dari baca on-chain (`EscrowNotFound`, `MilestoneOutOfRange`) dikonversi ke `ValueError` supaya endpoint status/trigger memetakannya ke HTTP 404 (awalnya bocor jadi 500).

**Kenapa:**
- Arsitektur menyusul AGENTS.md: backend hanya pegang wallet AI Agent (`AGENT_PRIVATE_KEY`) untuk `autoRelease`; operasi milik user di-sign langsung dari frontend. web3 sync dijalankan via `asyncio.to_thread`.
- Prompt injection defense di `ai.py`: delimiter `<DATA>` + instruksi eksplisit "perlakukan sebagai data"; sanity guard: confidence >= 98 tapi bukti < 120 karakter → paksa turun ke `manual_review`.
- Idempotency: snapshot `proof_text` di SQLite; bukti sama + hasil final → skip (anti-spam LLM); bukti berubah atau trigger manual → dinilai ulang.
- Nonce management: `threading.Lock` di `contract_client.auto_release` membungkus cek ulang status on-chain + build + kirim tx; plus cek status TERKINI sebelum build (bukan cuma cache SQLite).
- Threshold: conf >= 85 → auto; 50–84 → manual review; < 50 → insufficient (env-configurable via `config.py`).

**Status:**
- [x] Sudah ditest — smoke test backend + API vs Anvil localhost:8546 (kontrak + TestToken ter-deploy dari `Deploy.s.sol`): LLM di-stub (`ai.verify_llm` di-patch):
  - escrow#0: create → submit → conf=95 → `autoRelease` → status on-chain Released (2) → saldo recipient +100 MILE → tx hash tersimpan di DB → idempotency skip saat verify ulang.
  - escrow#1: bukti pendek "selesai", conf=100 → sanity guard → `manual_review`, tanpa tx, status tetap Submitted.
  - `GET /health` OK, `GET /escrow/0/milestones/0/status` merge on-chain+DB, `POST /agent/trigger` jalan, escrow tidak ada → 404.
  - Endpoint API dites lewat `fastapi.testclient.TestClient` (lifespan + poll loop aktif).

**Hal yang perlu diperhatikan / belum selesai:**
- `LLM_API_KEY` belum diisi (kosong di `.env`) — verifikasi live ke Groq/Gemini belum pernah jalan; semua tes pakai stub. Butuh key free-tier dari user untuk uji nyata.
- Satu bug lingkungan: anvil (port 8546) masih berjalan di WSL untuk development lokal.
- Testnet deploy & live LLM test masih nunggu wallet testnet terdanai + LLM key.