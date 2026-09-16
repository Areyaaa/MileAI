"""Konfigurasi backend: semua dibaca dari environment / .env, tak ada yang di-hardcode."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

BACKEND_DIR = Path(__file__).resolve().parent

# RPC BSC Testnet (public & gratis)
RPC = os.getenv("BSC_TESTNET_RPC", "https://data-seed-prebsc-1-s1.binance.org:8545")

# Alamat kontrak hasil deploy (diisi setelah deploy ke testnet). Kosong = backend
# tetap bisa mulai tapi endpoint yang butuh chain akan balas 503 "not configured".
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "").strip()

# Satu-satunya private key yang dipegang backend = wallet AI Agent (untuk autoRelease).
# Tidak pernah menerima/menyimpan key milik payer/recipient (prinsip API design).
AGENT_PRIVATE_KEY = os.getenv("AGENT_PRIVATE_KEY", "").strip()

# ABI kontrak. Default menunjuk hasil build Foundry (satu sumber kebenaran).
ABI_PATH = os.getenv(
    "CONTRACT_ABI_PATH",
    str(BACKEND_DIR / ".." / "contracts" / "out" / "MilestoneEscrow.sol" / "MilestoneEscrow.json"),
)

# LLM (free tier). provider: "groq" atau "gemini".
LLM_API_KEY = os.getenv("LLM_API_KEY", "").strip()
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq").strip().lower()
LLM_MODEL = os.getenv("LLM_MODEL", "").strip()

# Keamanan endpoint POST /agent/trigger. Kalau DIISI, endpoint cuma melayani
# request dengan header "Authorization: Bearer <token>" atau "X-Agent-Token:
# <token>". Kosong = mode dev (endpoint terbuka) — untuk demo lokal saja.
# Catatan: token ini dikirim frontend lewat NEXT_PUBLIC (terlihat di browser),
# jadi sifatnya guardian ringan anti-spam, BUKAN autentikasi kuat.
AGENT_TRIGGER_TOKEN = os.getenv("AGENT_TRIGGER_TOKEN", "").strip()

# CORS: daftar origin yang diizinkan (comma-separated). Default hanya localhost
# untuk dev. Kalau frontend di-hosting (mis. Vercel), set
# ALLOWED_CORS_ORIGINS=https://<app>.vercel.app (boleh multi, pisahkan koma).
# "*" tersedia sebagai last resort demo, tapi tidak disarankan.
_CORS_DEFAULT = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]
_cors_env = os.getenv("ALLOWED_CORS_ORIGINS", "").strip()
if not _cors_env:
    ALLOWED_CORS_ORIGINS = list(_CORS_DEFAULT)
elif _cors_env == "*":
    ALLOWED_CORS_ORIGINS = ["*"]
else:
    ALLOWED_CORS_ORIGINS = [o.strip() for o in _cors_env.split(",") if o.strip()]

# Behavior AI agent.
POLL_INTERVAL_SECONDS = float(os.getenv("POLL_INTERVAL_SECONDS", "12"))
CONFIDENCE_AUTO = int(os.getenv("CONFIDENCE_AUTO", "85"))        # >= 85 -> autoRelease
CONFIDENCE_REVIEW_MIN = int(os.getenv("CONFIDENCE_REVIEW_MIN", "50"))  # 50-84 -> review manual
PROOF_MIN_LEN_FOR_HIGH_SCORE = int(os.getenv("PROOF_MIN_LEN_FOR_HIGH_SCORE", "120"))
HIGH_SCORE_LIMIT = int(os.getenv("HIGH_SCORE_LIMIT", "98"))       # sanity guard threshold

DB_PATH = os.getenv("DB_PATH", str(BACKEND_DIR / "mileai.db"))

# On-chain status enum MilestoneEscrow.MilestoneStatus.
STATUS_PENDING = 0
STATUS_SUBMITTED = 1
STATUS_RELEASED = 2
STATUS_DISPUTED = 3