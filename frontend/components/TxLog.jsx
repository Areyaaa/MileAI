// ============================================================================
// Transactions — halaman/section khusus untuk melihat SEMUA transaksi terkait
// escort ef, dari pembuatan sampai pembayaran:
//   - create / submit / approve / refund  ->  tx log lokal (wallet user, .txlog)
//   - release (autoRelease AI)            ->  backend /verify/all (tx_hash)
// Tombol "View all tx" membuka tabel; "Clear log" menghapus log lokal.
// ============================================================================
import { useEffect, useState } from "react";
import * as chain from "../lib/contract";
import { fetchAllVerifications } from "../lib/api";
import { getTxLog, resetTxLog } from "../lib/txlog";

const KIND_LABEL = {
  create: "Create escrow",
  submit: "Submit proof",
  approve: "Manual approve",
  release: "Release (pay)",
  refund: "Refund",
};

function fmtWhen(t) {
  if (!t) return "—";
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return String(t).slice(0, 10);
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TxLog() {
  const [localTxs, setLocalTxs] = useState(getTxLog);
  const [releases, setReleases] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLocalTxs(getTxLog());
      try {
        const res = await fetchAllVerifications();
        const list =
          (res && Array.isArray(res.verifications) && res.verifications) || [];
        if (alive) setReleases(list.filter((v) => v.tx_hash));
      } catch {
        if (alive) setReleases([]);
      }
    };
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const rows = [
    ...localTxs.map((x) => ({ ...x, src: "local" })),
    ...releases.map((v) => ({
      src: "backend",
      kind: "release",
      hash: v.tx_hash,
      escrowId: v.escrow_id,
      milestoneIndex: v.milestone_index,
      t: v.updated_at,
    })),
  ].sort((a, b) => String(b.t || "").localeCompare(String(a.t || "")));

  return (
    <section className="card" id="transactions" style={{ marginTop: 12 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Transactions</h3>
        <div className="row">
          <button
            className="btn btn-ghost sm"
            style={{ marginRight: 4 }}
            onClick={() => {
              resetTxLog();
              setLocalTxs(getTxLog());
            }}
          >
            Clear log
          </button>
        </div>
      </div>
      <div className="txScroll">
        <table className="txTable wide">
          <thead>
            <tr><th>Type</th><th>Tx</th><th>Escrow</th><th>M</th><th>When</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="meta">No transactions recorded yet.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id || r.tx_hash || r.hash}>
                <td>{KIND_LABEL[r.kind] || r.kind}</td>
                <td>
                  {chain.EXPLORER_URL ? (
                    <a href={chain.explorerTxUrl(r.tx_hash || r.hash)} target="_blank" rel="noreferrer">
                      {`${String(r.tx_hash || r.hash).slice(0, 10)}…${String(r.tx_hash || r.hash).slice(-6)}`} ↗
                    </a>
                  ) : (
                    String(r.tx_hash || r.hash).slice(0, 20)
                  )}
                </td>
                <td>{r.escrowId ?? "—"}</td>
                <td>{r.milestoneIndex ?? "—"}</td>
                <td className="meta">{fmtWhen(r.t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}