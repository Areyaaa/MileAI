// Klien API backend MileAI (FastAPI) — hanya untuk baca status verifikasi AI
// dan trigger verifikasi opsional (dev). Semua tx tetap di-sign user
// (lib/contract.js).
const API_BASE =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:8000";

// Token ringan untuk endpoint POST /agent/trigger (anti-spam LLM).
// Harus sama dengan AGENT_TRIGGER_TOKEN di backend/.env.
// Kosong = don't send header (backend mode dev/terbuka).
const TRIGGER_TOKEN = process.env.NEXT_PUBLIC_TRIGGER_TOKEN || "";

async function jget(url) {
  const res = await fetch(url);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* body bukan JSON */
    }
    throw new Error(`Backend ${res.status}: ${detail}`);
  }
  return res.json();
}

async function jpost(url) {
  const headers = TRIGGER_TOKEN ? { "X-Agent-Token": TRIGGER_TOKEN } : {};
  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* body bukan JSON */
    }
    throw new Error(`Backend ${res.status}: ${detail}`);
  }
  return res.json();
}

// Path plural (/escrows/...) mengikuti spek AGENTS.md & dipasang sebagai
// alias route di backend main.py.
export async function fetchMilestoneStatus(escrowId, milestoneIndex) {
  return jget(`${API_BASE}/escrows/${escrowId}/milestones/${milestoneIndex}/status`);
}

// Endpoint backend adalah POST (dependencies token). Diperbaiki dari GET
// yang sebelumnya tidak match method dan menghasilkan 405.
export async function triggerVerification(escrowId, milestoneIndex) {
  return jpost(`${API_BASE}/agent/trigger/${escrowId}/${milestoneIndex}`);
}

export { API_BASE };