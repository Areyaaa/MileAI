// ============================================================================
// Dashboard Payer — semua escrow yang DIBUAT oleh wallet ini.
//
// - Statistik ringkas (total escrow, dana terkunci, dana cair, menunggu review)
// - Satu card per escrow: project, recipient, token, semua milestone dengan
//   status on-chain + confidence & alasan dari backend, tombol approve manual
//   (kalau "Perlu Review Manual"), re-verifikasi, dan refund.
// - Auto refresh tiap ±15 detik (sinkron interval polling AI agent backend).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { MilestoneRow, TokenSymbol, fmtAddr } from "../../components/bits";
import { AnimatedNumber } from "../../components/fx";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import * as api from "../../lib/api";
import { loadAllEscrows, byPayer } from "../../lib/escrows";
import { getProjects } from "../../lib/projects";

function PayerEscrowCard({ escrow, ai, projectName, provider, busy, onApprove, onRecheck, onRefund }) {
  const { id, data } = escrow;
  return (
    <section className="card">
      <header className="escrowHead">
        <h3>Escrow #{id} · {projectName || "Tanpa nama project"}</h3>
        <button className="btn btn-danger sm" onClick={() => onRefund(id)}
          disabled={Boolean(busy) || data.refunded}>
          Refund
        </button>
      </header>
      <div className="user-grid">
        <div>Recipient: <span>{fmtAddr(data.recipient)}</span></div>
        <div>Token: <span><TokenSymbol provider={provider} token={data.token} /></span></div>
        <div>Refunded: <span>{String(data.refunded)}</span></div>
      </div>
      {data.milestones.map((m) => (
        <MilestoneRow key={m.index} escrowId={id} m={m} ai={ai[m.index]}
          renderActions={({ review, submitted }) => (
            <>
              {review && (
                <button className="btn btn-ghost sm" onClick={() => onApprove(id, m.index)}
                  disabled={Boolean(busy)}>
                  Approve Manual
                </button>
              )}
              {submitted && (
                <button className="btn btn-ghost sm" onClick={() => onRecheck(id, m.index)}
                  disabled={Boolean(busy)}>
                  Re-verifikasi
                </button>
              )}
            </>
          )} />
      ))}
    </section>
  );
}

function StatsBar({ stats }) {
  return (
    <div className="statsBar">
      <div className="stat"><div className="num"><AnimatedNumber value={stats.count} decimals={0} /></div><div className="lbl">Escrow</div></div>
      <div className="stat"><div className="num"><AnimatedNumber value={stats.locked} /></div><div className="lbl">Dana terkunci</div></div>
      <div className="stat good"><div className="num"><AnimatedNumber value={stats.released} /></div><div className="lbl">Sudah cair</div></div>
      <div className="stat warn"><div className="num"><AnimatedNumber value={stats.review} /></div><div className="lbl">Perlu review</div></div>
      <div className="stat"><div className="num"><AnimatedNumber value={stats.submitted} /></div><div className="lbl">Menunggu AI</div></div>
    </div>
  );
}

export default function PayerDashboard() {
  const { provider, account, requireSigner, pushLog, setError, busy, setBusy } = useWallet();
  const router = useRouter();
  const [escrows, setEscrows] = useState([]);
  const [aiData, setAiData] = useState({});
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");

  const load = async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      const { list, ai, note: n } = await loadAllEscrows(provider);
      setEscrows(list);
      setAiData(ai);
      setNote(n);
      setProjects(getProjects());
      pushLog(`Data escrow dimuat (${list.length} on-chain).`);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (provider) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account]);

  useEffect(() => {
    if (!provider) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, account]);

  const mine = byPayer(escrows, account);

  const stats = useMemo(() => {
    let locked = 0, released = 0, pending = 0, submitted = 0, review = 0;
    for (const e of mine) {
      for (const m of e.data.milestones) {
        const amt = parseFloat(m.amountEther) || 0;
        locked += amt;
        const ai = aiData[e.id] && aiData[e.id][m.index];
        const disp = (ai && ai.display) || chain.STATUS[m.status];
        if (disp.includes("Released")) released += amt;
        else if (disp.includes("Review")) review += amt;
        else if (disp.includes("Submitted")) submitted += amt;
        else pending += amt;
      }
    }
    return { count: mine.length, locked, released, pending, submitted, review };
  }, [mine, aiData]);

  const onApprove = async (escrowId, idx) => {
    try {
      setError(null);
      setBusy(`approve-${escrowId}-${idx}`);
      const signer = await requireSigner();
      const rc = await chain.manualApprove(signer, escrowId, idx);
      pushLog(`Manual approve escrow ${escrowId} m${idx}: ${rc.hash}`);
      await load();
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  const onRecheck = async (escrowId, idx) => {
    try {
      setError(null);
      setBusy(`recheck-${escrowId}-${idx}`);
      const res = await api.triggerVerification(escrowId, idx);
      pushLog(`Verifikasi ulang escrow ${escrowId} m${idx}: ${res.action} (conf ${res.confidence}).`);
      await load();
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  const onRefund = async (escrowId) => {
    try {
      setError(null);
      setBusy(`refund-${escrowId}`);
      const signer = await requireSigner();
      const rc = await chain.refundEscrow(signer, escrowId);
      pushLog(`Refund escrow ${escrowId}: ${rc.hash}`);
      await load();
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Layout role="payer" title="Dashboard Payer"
      subtitle="Milestone yang kamu buat & status verifikasi AI" active="/payer">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div className="meta">{mine.length} escrow milik kamu · auto-refresh ±15 dtk</div>
        <div className="row">
          <button className="btn btn-ghost sm" onClick={() => router.push("/payer/create")}
            disabled={Boolean(busy)}>
            + Buat Escrow Baru
          </button>
          <button className="btn btn-ghost sm" onClick={load} disabled={loading}>
            {loading ? "Memuat…" : "Refresh"}
          </button>
        </div>
      </div>
      {note && <div className="meta" style={{ marginBottom: 8 }}>{note}</div>}

      <StatsBar stats={stats} />

      {loading && mine.length === 0 && (
        <div className="card empty">Memuat escrow on-chain…</div>
      )}
      {!loading && mine.length === 0 && (
        <div className="card empty">
          Belum ada escrow untuk wallet ini. Buat escrow pertama lewat menu <b>Buat Escrow</b>.
        </div>
      )}

      <div className="grid">
        {mine.map((e) => (
          <PayerEscrowCard key={e.id} escrow={e} ai={aiData[e.id] || {}}
            projectName={projects[String(e.id)]} provider={provider}
            busy={busy} onApprove={onApprove} onRecheck={onRecheck} onRefund={onRefund} />
        ))}
      </div>
    </Layout>
  );
}