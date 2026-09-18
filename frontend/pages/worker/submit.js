// ============================================================================
// Submit Proof (Worker).
//
// - Pick an escrow (dropdown of the worker's escrows that still have Pending
//   milestones). The escrow can be prefilled via ?escrow=<id> query.
// - Pick a milestone (chained dropdown — milestones of the selected escrow,
//   only those still Pending).
// - Fill in proof of work text + LINK (required). Proof is sent to the
//   contract, then polled and verified by the backend AI Agent (auto-release).
// ============================================================================
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import { loadAllEscrows, byRecipient } from "../../lib/escrows";
import { getProjects } from "../../lib/projects";

export default function WorkerSubmit() {
  const { provider, account, requireSigner, pushLog, setError, busy, setBusy } = useWallet();
  const router = useRouter();

  const [escrows, setEscrows] = useState([]);
  const [projects, setProjects] = useState({});
  const [escrowSel, setEscrowSel] = useState("");
  const [milestoneSel, setMilestoneSel] = useState("");
  const [proof, setProof] = useState("");
  const [link, setLink] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    try {
      const { list } = await loadAllEscrows(provider);
      setEscrows(list);
      setProjects(getProjects());
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

  // Prefill the escrow from ?escrow=<id> query (e.g., dashboard worker button).
  useEffect(() => {
    const q = router.query.escrow;
    if (q && Array.isArray(q) ? q[0] : q) {
      setEscrowSel(String(q));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.escrow]);

  const mine = byRecipient(escrows, account);

  const chosen = escrows.find((e) => String(e.id) === String(escrowSel));

  // When the escrow changes, fetch its Pending milestone list.
  const pendingMilestones = useMemo(() => {
    if (!escrowSel || !chosen) return [];
    return chosen.data.milestones.filter((m) => m.status === 0);
  }, [escrowSel, chosen]);

  useEffect(() => {
    // Reset if the selected escrow has no Pending milestones / is no longer valid.
    if (escrowSel && pendingMilestones.length === 0 && !loading) {
      setEscrowSel("");
      setMilestoneSel("");
    }
  }, [escrowSel, pendingMilestones, loading]);

  const onSubmit = async () => {
    try {
      setError(null);
      if (!escrowSel) throw new Error("Select an escrow first.");
      if (milestoneSel === "") throw new Error("Select the milestone to submit.");
      if (!proof.trim()) throw new Error("Fill in the proof of work text.");
      if (!/^https?:\/\/\S+\.\S+/.test(link.trim())) {
        throw new Error("The link is required and must be valid (https://…).");
      }
      setBusy("submit");
      const signer = await requireSigner();
      const text = `${proof.trim()}\nLink: ${link.trim()}`;
      const rc = await chain.submitProof(signer, parseInt(escrowSel, 10), parseInt(milestoneSel, 10), text);
      pushLog(`Proof submitted escrow ${escrowSel} m${milestoneSel}: ${rc.hash}`);
      setResult({ escrowId: escrowSel, milestone: milestoneSel, hash: rc.hash, proofText: text });
      setProof("");
      setLink("");
      setMilestoneSel("");
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Layout role="worker" title="Submit Proof"
      subtitle="Send proof of work for your escrow — verified by AI" active="/worker/submit">
      {result && (
        <section className="card successCard">
          <h3>Proof submitted</h3>
          <div className="meta">
            Escrow #{result.escrowId} · Milestone {result.milestone} · Tx: {result.hash.slice(0, 22)}… 
          </div>
          <div className="meta">
            The AI Agent will verify the proof automatically (polling ±15s). If confidence
            &gt;= 85, funds are released immediately — keep an eye on the Dashboard.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => router.push("/worker")}>Go to Dashboard</button>
            <button className="btn btn-ghost" onClick={() => { setResult(null); load(); }}>Submit again</button>
          </div>
        </section>
      )}

      <section className="card formCard">
        <div className="field">
          <label>Escrow</label>
          <select value={escrowSel} onChange={(e) => { setEscrowSel(e.target.value); setMilestoneSel(""); }}>
            <option value="">— Select an escrow —</option>
            {mine.map((e) => {
              const pend = e.data.milestones.filter((m) => m.status === 0).length;
              return (
                <option key={e.id} value={String(e.id)}>
                  Escrow #{e.id} · {projects[String(e.id)] || "unnamed"} ({pend} milestones available)
                </option>
              );
            })}
          </select>
        </div>

        <div className="field">
          <label>Milestone (linked to the escrow above)</label>
          <select value={milestoneSel} onChange={(e) => setMilestoneSel(e.target.value)}
            disabled={!escrowSel || pendingMilestones.length === 0}>
            <option value="">— Select a pending milestone —</option>
            {pendingMilestones.map((m) => (
              <option key={m.index} value={String(m.index)}>
                Milestone {m.index} — {m.amountEther} token · {m.proofRequirement}
              </option>
            ))}
          </select>
          {escrowSel && pendingMilestones.length === 0 && (
            <div className="formHint">All milestones in this escrow are already done (none pending).</div>
          )}
        </div>

        <div className="field">
          <label>Proof of work — what did you complete</label>
          <textarea value={proof} onChange={(e) => setProof(e.target.value)}
            placeholder="Describe the work completed for this milestone…" />
        </div>

        <div className="field">
          <label>Link (required)</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>

        <button className="btn" onClick={onSubmit} disabled={Boolean(busy)}>
          Submit Proof
        </button>
        <div className="formHint">
          The proof is sent to the contract, then polled by the backend AI Agent. The link is
          required so there's evidence the AI can verify.
        </div>
      </section>
    </Layout>
  );
}