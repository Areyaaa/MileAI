// Loads all on-chain escrows + backend AI verification results, used by the
// payer & worker dashboards. The backend is only used to READ AI verdicts
// (confidence/reason); all txs are still signed by the user (lib/contract.js).
import * as chain from "./contract";
import * as api from "./api";

const MAX_SCAN = 50;

// The backend returns display status labels in Indonesian (see backend/main.py
// ACTION_LABEL). Map them to English here so the whole UI stays in English.
const DISPLAY_EN = {
  "Perlu Review Manual": "Manual Review Needed",
  "Bukti Belum Cukup": "Insufficient Evidence",
  "Error Verifikasi": "Verification Error",
  "Released by AI (auto)": "Released by AI (auto)",
};

const enDisplay = (label) => (label && DISPLAY_EN[label]) || label;

export async function loadAllEscrows(provider, maxScan = MAX_SCAN) {
  const count = await chain.readEscrowCount(provider);
  const n = Math.min(count, maxScan);
  const list = [];
  const ai = {};
  for (let id = 0; id < n; id++) {
    const data = await chain.readEscrowOnchain(provider, id);
    const perEscrow = {};
    for (const m of data.milestones) {
      try {
        const st = await api.fetchMilestoneStatus(id, m.index);
        perEscrow[m.index] = { ver: st.verification, display: enDisplay(st.display_status) };
      } catch (e) {
        perEscrow[m.index] = { backendError: e.message, display: null };
      }
    }
    list.push({ id, data });
    ai[id] = perEscrow;
  }
  return {
    list,
    ai,
    count,
    note: count > maxScan ? `Showing the first ${maxScan} escrows of ${count}.` : "",
  };
}

export const byPayer = (list, account) =>
  list.filter((e) => account && e.data.payer.toLowerCase() === account.toLowerCase());

export const byRecipient = (list, account) =>
  list.filter((e) => account && e.data.recipient.toLowerCase() === account.toLowerCase());