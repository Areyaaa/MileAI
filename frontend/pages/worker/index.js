// ============================================================================
// Worker Dashboard — all escrows where this wallet is the recipient.
//
// - Stats: total escrows, total milestone funds, funds already RELEASED (token)
// - One compact card per escrow (same as payer): escrow id, project name,
//   payer, token, plus per-milestone summary (status badge + AI confidence
//   score + milestone token amount). Each `.msMini` row is clickable and opens
//   a detail popup (MilestoneModal); for Pending milestones the popup has a
//   Submit Proof button that routes to the submit page prefilled (escrow +
//   milestone) — the submit function stays on /worker/submit.
// - Auto refresh every ±15 seconds (syncs with the AI agent poll).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import MilestoneModal from "../../components/MilestoneModal";
import { StatusBadge, TokenSymbol, fmtAddr } from "../../components/bits";
import { AnimatedNumber } from "../../components/fx";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import { loadAllEscrows, byRecipient } from "../../lib/escrows";
import { getProjects } from "../../lib/projects";

function WorkerEscrowCard({ escrow, ai, projectName, provider, onOpenMilestone }) {
  const { id, data } = escrow;
  return (
    <section className="card escrowCardBtn">
      <header className="escrowHead">
        <h3>Escrow #{id} · {projectName || "Unnamed project"}</h3>
      </header>
      <div className="user-grid">
        <div>Payer: <span>{fmtAddr(data.payer)}</span></div>
        <div>Token: <span><TokenSymbol provider={provider} token={data.token} /></span></div>
        <div>Progress: <span>{data.milestones.filter((m) => m.status === chain.STATUS_RELEASED).length}/{data.milestones.length} released</span></div>
      </div>
      {data.milestones.map((m) => {
        const a = (ai || {})[m.index] || {};
        const ver = a.ver || {};
        const display = a.display || chain.STATUS[m.status] || String(m.status);
        const conf = ver.confidence !== undefined ? Math.round(Number(ver.confidence) || 0) : null;
        return (
          <div className="msMini msMiniClick" key={m.index}
            role="button" tabIndex={0}
            onClick={() => onOpenMilestone(m)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenMilestone(m); } }}>
            <span className="msMiniIdx">M{m.index}</span>
            <StatusBadge label={display} />
            {conf !== null && <span className="msMiniConf" title={`Confidence ${conf}/100`}>◍ {conf}</span>}
            <span className="msMiniAmt">{m.amountEther} token</span>
          </div>
        );
      })}
    </section>
  );
}

function StatsBar({ stats }) {
  return (
    <div className="statsBar">
      <div className="stat"><div className="num"><AnimatedNumber value={stats.count} decimals={0} /></div><div className="lbl">Escrow</div></div>
      <div className="stat"><div className="num"><AnimatedNumber value={stats.msCount} decimals={0} /></div><div className="lbl">Milestone</div></div>
      <div className="stat good"><div className="num"><AnimatedNumber value={stats.received} /></div><div className="lbl">Total released</div></div>
      <div className="stat warn"><div className="num"><AnimatedNumber value={stats.review} /></div><div className="lbl">Needs review</div></div>
      <div className="stat"><div className="num"><AnimatedNumber value={stats.pending} /></div><div className="lbl">Not started</div></div>
    </div>
  );
}

export default function WorkerDashboard() {
  const { provider, account, pushLog, setError, busy } = useWallet();
  const router = useRouter();
  const [escrows, setEscrows] = useState([]);
  const [aiData, setAiData] = useState({});
  const [projects, setProjects] = useState({});
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState("");
  const [count, setCount] = useState(0);
  const [openMs, setOpenMs] = useState(null); // { escrowId, index } | null

  const load = async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      const { list, ai, note: n, count: c } = await loadAllEscrows(provider);
      setEscrows(list);
      setAiData(ai);
      setNote(n);
      setCount(c);
      setProjects(getProjects());
      pushLog(`Escrow data loaded (${list.length} on-chain).`);
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

  const mine = byRecipient(escrows, account);

  const stats = useMemo(() => {
    let received = 0, pending = 0, review = 0, sub = 0, msCount = 0;
    for (const e of mine) {
      msCount += e.data.milestones.length;
      for (const m of e.data.milestones) {
        const amt = parseFloat(m.amountEther) || 0;
        const ai = aiData[e.id] && aiData[e.id][m.index];
        const disp = (ai && ai.display) || chain.STATUS[m.status];
        if (disp.includes("Released")) received += amt;
        else if (disp.includes("Review")) review += amt;
        else if (disp.includes("Submitted")) sub += amt;
        else pending += amt;
      }
    }
    return { count: mine.length, msCount, received, pending, review, submitted: sub };
  }, [mine, aiData]);

  // Popup detail: resolve which escrow + milestone + AI verdict is open.
  const openEscrow = openMs
    ? (escrows.find((e) => String(e.id) === String(openMs.escrowId)) || null)
    : null;
  const openMilestone = openEscrow && openMs
    ? (openEscrow.data.milestones.find((m) => String(m.index) === String(openMs.index)) || null)
    : null;

  return (
    <Layout role="worker" title="Worker Dashboard"
      subtitle="Escrows you're working on & fund releases" active="/worker">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <div className="meta">{mine.length} escrows of yours · auto-refresh ±15s</div>
        <button className="btn btn-ghost sm" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>
      {note && <div className="meta" style={{ marginBottom: 8 }}>{note}</div>}

      <StatsBar stats={stats} />

      {loading && mine.length === 0 && (
        <div className="card empty">Loading on-chain escrows…</div>
      )}
      {!loading && mine.length === 0 && (
        <div className="card empty">
          No escrows set this wallet as the recipient yet.
          <div className="meta" style={{ marginTop: 8 }}>
            Connected wallet: <b>{fmtAddr(account) || "—"}</b> · {count} escrow(s) on-chain.
            The worker dashboard only shows escrows whose <b>recipient</b> is the
            connected wallet — switch to the recipient wallet to see them.
          </div>
        </div>
      )}

      <div className="grid">
        {mine.map((e) => (
          <WorkerEscrowCard key={e.id} escrow={e} ai={aiData[e.id] || {}}
            projectName={projects[String(e.id)]} provider={provider}
            onOpenMilestone={(m) => setOpenMs({ escrowId: e.id, index: m.index })} />
        ))}
      </div>

      {openEscrow && openMilestone && (
        <MilestoneModal escrow={openEscrow} m={openMilestone}
          ai={aiData[openEscrow.id] && aiData[openEscrow.id][openMilestone.index]}
          projectName={projects[String(openEscrow.id)]} provider={provider}
          onClose={() => setOpenMs(null)}
          onGoSubmit={(escrowId, index) => {
            setOpenMs(null);
            router.push(`/worker/submit?escrow=${escrowId}&milestone=${index}`);
          }} />
      )}
    </Layout>
  );
}