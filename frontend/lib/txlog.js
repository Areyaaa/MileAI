// Local activity/tx log (localStorage) — transaksi yang di-sign langsung dari
// wallet user: createEscrow, submitProof, manualApprove, refund.
// autoRelease (dieksekusi AI) tidak disimpan di sini — diambil dari backend
// /verify/all dan digabung di komponen TxLog.
const KEY = "mileai:txlog";

export function addTxLog(kind, entry) {
  try {
    const list = getTxLog();
    list.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      t: Date.now(),
      ...entry,
    });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    // storage tidak tersedia (SSR/privacy) — abaikan
  }
}

export function getTxLog() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) || [] : [];
  } catch {
    return [];
  }
}

export function resetTxLog() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // noop
  }
}