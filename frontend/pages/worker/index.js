// ============================================================================
// Worker Dashboard — all escrows where this wallet is the recipient.
//
// - Stats: total escrows, total milestone funds, funds already RELEASED (token)
// - "Fund release notifications": list of Released milestones -> how much came
//   in + tx hash.
// - One card per escrow: project, payer, token, per-milestone progress
//   (status + confidence + AI reason). For Pending milestones there's a
//   Submit Proof button (goes straight to the submit page, escrow prefilled).
// - Auto refresh every ±15 seconds (syncs with the AI agent poll).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { MilestoneRow, TokenSymbol, fmtAddr } from "../../components/bits";
import { AnimatedNumber } from "../../components/fx";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import { loadAllEscrows, byRecipient } from "../../lib/escrows";
import { getProjects } from "../../lib/projects";

function WorkerEscrowCard({ escrow, ai, projectName, provider, pendingCount, onGoSubmit }) {
  const { id, data } = escrow;
  return (
    <section className="card">
      <header className="escrowHead">
        <h3>Escrow #{id} · {projectName || "Unnamed project"}</h3>
        {pendingCount > 0 && (
          <button className="btn btn-ghost sm" onClick={() => onGoSubmit(id)}>
            Submit Proof
          </button>
        )}
      </header>
      <div className="user-grid">
        <div>Payer: <span>{fmtAddr(data.payer)}</span></div>
        <div>Token: <span><TokenSymbol provider={provider} token={data.token} /></span></div>
        <div>Progress: <span>{data.milestones.filter((m) => m.status === 2).length}/{data.milestones.length} released</span></div>
      </div>
      {data.milestones.map((m) => (
        <MilestoneRow key={m.index} escrowId={id} m={m} ai={ai[m.index]} />
      ))}
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

  // Fund release notifications (from AI autoRelease / manual approve).
  const releases = useMemo(() => {
    const out = [];
    for (const e of mine) {
      for (const m of e.data.milestones) {
        const ai = aiData[e.id] && aiData[e.id][m.index];
        const disp = (ai && ai.display) || chain.STATUS[m.status];
        if (disp.includes("Released")) {
          out.push({ escrowId: e.id, index: m.index, amount: m.amountEther, tx: ai.ver.tx_hash });
        }
      }
    }
    return out.sort((a, b) => (a.tx || "").localeCompare(b.tx || ""));
  }, [mine, aiData]);

  const pendingCount = (escrowId) =>
    (escrows.find((e) => e.id === escrowId) || {}).data?.milestones?.filter((m) => m.status === 0).length || 0;

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
          No escrows set this wallet as the recipient yet. Ask a payer to create
          an escrow with your address.
        </div>
      )}

      {releases.length > 0 && (
        <section className="card">
          <h3 style={{ margin: "0 0 8px" }}>Fund release notifications</h3>
          {releases.map((r) => (
            <div className="releaseRow" key={`${r.escrowId}-${r.index}`}>
              <span className="releaseAmount">+{r.amount} token</span>
              <span className="meta">
                Milestone {r.index} · Escrow #{r.escrowId} {r.tx && <>· tx {r.tx.slice(0, 12)}…</>}
              </span>
            </div>
          ))}
        </section>
      )}

      <div className="grid">
        {mine.map((e) => (
          <WorkerEscrowCard key={e.id} escrow={e} ai={aiData[e.id] || {}}
            projectName={projects[String(e.id)]} provider={provider}
            pendingCount={pendingCount(e.id)} onGoSubmit={(id) => router.push(`/worker/submit?escrow=${id}`)} />
        ))}
      </div>
    </Layout>
  );
}