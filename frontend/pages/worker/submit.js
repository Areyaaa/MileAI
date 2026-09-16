// ============================================================================
// Submit Bukti (Worker).
//
// - Pilih escrow (dropdown escrow milik worker yang masih punya milestone
//   Pending). Escrow bisa diisi otomatis lewat query ?escrow=<id>.
// - Pilih milestone (dropdown "menyambung" — daftar milik escrow terpilih,
//    hanya yang masih Pending).
// - Isi teks bukti kerja + LINK (wajib). Bukti dikirim ke kontrak, lalu
//   di-pol dan diverifikasi sendiri oleh AI Agent backend (auto-release).
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

  // Prefill escrow dari query ?escrow=<id> (mis. tombol di dashboard worker).
  useEffect(() => {
    const q = router.query.escrow;
    if (q && Array.isArray(q) ? q[0] : q) {
      setEscrowSel(String(q));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.escrow]);

  const mine = byRecipient(escrows, account);

  const chosen = escrows.find((e) => String(e.id) === String(escrowSel));

  // Saat escrow berubah, ambil daftar milestone Pending milik escrow itu.
  const pendingMilestones = useMemo(() => {
    if (!escrowSel || !chosen) return [];
    return chosen.data.milestones.filter((m) => m.status === 0);
  }, [escrowSel, chosen]);

  useEffect(() => {
    // Kalau escrow terpilih tidak punya milestone Pending / sudah tidak valid, reset.
    if (escrowSel && pendingMilestones.length === 0 && !loading) {
      setEscrowSel("");
      setMilestoneSel("");
    }
  }, [escrowSel, pendingMilestones, loading]);

  const onSubmit = async () => {
    try {
      setError(null);
      if (!escrowSel) throw new Error("Pilih escrow terlebih dahulu.");
      if (milestoneSel === "") throw new Error("Pilih milestone yang mau disubmit.");
      if (!proof.trim()) throw new Error("Isi teks bukti kerja.");
      if (!/^https?:\/\/\S+\.\S+/.test(link.trim())) {
        throw new Error("Link wajib diisi dan harus valid (https://…).");
      }
      setBusy("submit");
      const signer = await requireSigner();
      const text = `${proof.trim()}\nLink: ${link.trim()}`;
      const rc = await chain.submitProof(signer, parseInt(escrowSel, 10), parseInt(milestoneSel, 10), text);
      pushLog(`Bukti dikirim escrow ${escrowSel} m${milestoneSel}: ${rc.hash}`);
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
    <Layout role="worker" title="Submit Bukti"
      subtitle="Kirim bukti kerja untuk escrow kamu — diverifikasi AI" active="/worker/submit">
      {result && (
        <section className="card successCard">
          <h3>Bukti terkirim</h3>
          <div className="meta">
            Escrow #{result.escrowId} · Milestone {result.milestone} · Tx: {result.hash.slice(0, 22)}… 
          </div>
          <div className="meta">
            AI Agent akan memverifikasi bukti secara otomatis (polling ±15 detik). Kalau confidence
            &gt;= 85, dana langsung dicairkan — pantau di Dashboard.
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => router.push("/worker")}>Ke Dashboard</button>
            <button className="btn btn-ghost" onClick={() => { setResult(null); load(); }}>Submit lagi</button>
          </div>
        </section>
      )}

      <section className="card formCard">
        <div className="field">
          <label>Escrow</label>
          <select value={escrowSel} onChange={(e) => { setEscrowSel(e.target.value); setMilestoneSel(""); }}>
            <option value="">— Pilih escrow —</option>
            {mine.map((e) => {
              const pend = e.data.milestones.filter((m) => m.status === 0).length;
              return (
                <option key={e.id} value={String(e.id)}>
                  Escrow #{e.id} · {projects[String(e.id)] || "tanpa project"} ({pend} milestone tersedia)
                </option>
              );
            })}
          </select>
        </div>

        <div className="field">
          <label>Milestone (menyambung dari escrow di atas)</label>
          <select value={milestoneSel} onChange={(e) => setMilestoneSel(e.target.value)}
            disabled={!escrowSel || pendingMilestones.length === 0}>
            <option value="">— Pilih milestone Pending —</option>
            {pendingMilestones.map((m) => (
              <option key={m.index} value={String(m.index)}>
                Milestone {m.index} — {m.amountEther} token · {m.proofRequirement}
              </option>
            ))}
          </select>
          {escrowSel && pendingMilestones.length === 0 && (
            <div className="formHint">Semua milestone di escrow ini sudah dikerjakan (bukan Pending).</div>
          )}
        </div>

        <div className="field">
          <label>Proof of work — apa saja yang kamu kerjakan</label>
          <textarea value={proof} onChange={(e) => setProof(e.target.value)}
            placeholder="Jelaskan pekerjaan yang sudah selesai untuk milestone ini…" />
        </div>

        <div className="field">
          <label>Link (wajib)</label>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </div>

        <button className="btn" onClick={onSubmit} disabled={Boolean(busy)}>
          Submit Bukti
        </button>
        <div className="formHint">
          Bukti dikirim ke kontrak lalu di-pol AI Agent backend. Link wajib diisi supaya ada
          bukti yang bisa dicek AI.
        </div>
      </section>
    </Layout>
  );
}