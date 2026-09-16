// Memuat semua escrow on-chain + hasil verifikasi AI backend, dipakai
// dashboard payer & worker. Backend hanya dipakai untuk BACA verdict AI
// (confidence/reason); semua tx tetap di-sign user (lib/contract.js).
import * as chain from "./contract";
import * as api from "./api";

const MAX_SCAN = 50;

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
        perEscrow[m.index] = { ver: st.verification, display: st.display_status };
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
    note: count > maxScan ? `Menampilkan ${maxScan} escrow pertama dari ${count}.` : "",
  };
}

export const byPayer = (list, account) =>
  list.filter((e) => account && e.data.payer.toLowerCase() === account.toLowerCase());

export const byRecipient = (list, account) =>
  list.filter((e) => account && e.data.recipient.toLowerCase() === account.toLowerCase());