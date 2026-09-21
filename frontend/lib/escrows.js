// Loads all on-chain escrows + backend AI verification results, used by the
// payer & worker dashboards. The backend is only used to READ AI verdicts
// (confidence/reason); all txs are still signed by the user (lib/contract.js).
import * as chain from "./contract";
import * as api from "./api";

const MAX_SCAN = 50;

// Backend menyimpan verdict sebagai action code (backend/agent.py, db.py).
// Map ke label UI bahasa Inggris (sama dengan ACTION_LABEL backend main.py,
// hanya dialih-bahasakan). Status on-chain tetap pakai chain.STATUS.
const ACTION_EN = {
  verified_auto: "Released by AI (auto)",
  manual_review: "Manual Review Needed",
  insufficient: "Insufficient Evidence",
  error: "Verification Error",
};

// Label tampilan per milestone, meniru logika backend main.py:
// on-chain "Submitted" + ada verdict AI -> label dari action verdict;
// selain itu -> status on-chain biasa.
function displayLabel(onchainStatus, ver) {
  if (ver && onchainStatus === chain.STATUS_SUBMITTED && ACTION_EN[ver.action]) {
    return ACTION_EN[ver.action];
  }
  return chain.STATUS[onchainStatus] || String(onchainStatus);
}

// Konkurensi terbatas: baca banyak escrow/milestone secara paralel tanpa
// membanjiri RPC publik (rate-limit).
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function loadAllEscrows(provider, maxScan = MAX_SCAN) {
  const count = await chain.readEscrowCount(provider);
  const n = Math.min(count, maxScan);

  // 1 panggilan HTTP ke backend untuk SEMUA verdict AI (dulu: N panggilan per
  // milestone). Backend down -> tandai seluruh milestone sebagai backendError,
  // status fallback ke on-chain.
  let verifs = [];
  let backendError = null;
  try {
    const res = await api.fetchAllVerifications();
    verifs = (res && Array.isArray(res.verifications)) ? res.verifications : [];
  } catch (e) {
    backendError = (e && e.message) || String(e);
  }
  const aiMap = new Map(
    verifs.map((v) => [`${v.escrow_id}:${v.milestone_index}`, v])
  );

  // Baca semua escrow on-chain secara paralel (dulu: serial -> lama sekali
  // karena tiap escrow butuh beberapa round-trip ke RPC publik).
  const jobs = [];
  for (let id = 0; id < n; id++) {
    jobs.push(async () => {
      try {
        const data = await chain.readEscrowOnchain(provider, id);
        return { ok: true, id, data };
      } catch (e) {
        return { ok: false, id, error: (e && e.message) || String(e) };
      }
    });
  }
  const results = await mapLimit(jobs, 8, (job) => job());

  const list = [];
  const ai = {};
  let skipped = 0;
  for (const r of results) {
    if (!r.ok) {
      skipped += 1;
      continue;
    }
    const { id, data } = r;
    const perEscrow = {};
    for (const m of data.milestones) {
      const key = `${id}:${m.index}`;
      const ver = aiMap.get(key);
      perEscrow[m.index] = {
        ver,
        display: displayLabel(m.status, ver),
        ...(backendError ? { backendError } : {}),
      };
    }
    list.push({ id, data });
    ai[id] = perEscrow;
  }
  return {
    list,
    ai,
    count,
    skipped,
    note: count > maxScan ? `Showing the first ${maxScan} escrows of ${count}.` : "",
  };
}

export const byPayer = (list, account) =>
  list.filter((e) => account && e.data.payer.toLowerCase() === account.toLowerCase());

export const byRecipient = (list, account) =>
  list.filter((e) => account && e.data.recipient.toLowerCase() === account.toLowerCase());