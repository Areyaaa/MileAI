// ============================================================================
// Buat Escrow (Payer).
//
// Form: alamat pembuat (otomatis wallet aktif), alamat penerima, nama project,
// alamat token ERC20, chain (default sesuai target), daftar milestone
// (jumlah token + kriteria). Approve token dulu lalu Buat Escrow.
// Setelah sukses: tampilkan ESCOW ID dari event EscrowCreated di receipt.
// Nama project disimpan di localStorage (keputusan desain — kontrak/backend
// tidak punya field project).
// ============================================================================
import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import { saveProject } from "../../lib/projects";

const MAX_MILESTONES = 10;
const CHAINS = [
  { id: 97, label: "BSC Testnet" },
  { id: 31337, label: "Anvil Lokal (dev)" },
];
const currentChain = chain.TARGET_CHAIN_ID;

export default function PayerCreate() {
  const { account, requireSigner, pushLog, setError, busy, setBusy } = useWallet();
  const router = useRouter();

  const [recipient, setRecipient] = useState("");
  const [project, setProject] = useState("");
  const [token, setToken] = useState("");
  const [chainId, setChainId] = useState(String(currentChain));
  const [milestones, setMilestones] = useState([{ amount: "", requirement: "" }]);
  const [created, setCreated] = useState(null);

  const totalEther = () => milestones.reduce((a, m) => a + (parseFloat(m.amount) || 0), 0);

  const setMilestone = (i, patch) =>
    setMilestones((arr) => arr.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const addMilestone = () =>
    setMilestones((arr) => (arr.length < MAX_MILESTONES ? [...arr, { amount: "", requirement: "" }] : arr));
  const removeMilestone = (i) =>
    setMilestones((arr) => (arr.length > 1 ? arr.filter((_, k) => k !== i) : arr));

  const wrongChain = Number(chainId) !== currentChain;

  const onApproveMax = async () => {
    try {
      setError(null);
      setBusy("approvemax");
      if (!ethers.isAddress(token.trim())) throw new Error("Alamat token tidak valid.");
      const signer = await requireSigner();
      const rc = await chain.approveTokenInfinite(signer, token.trim());
      pushLog(`Token di-approve-infinite: ${rc.hash}`);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  const onApproveToken = async () => {
    try {
      setError(null);
      setBusy("approve");
      if (!ethers.isAddress(token.trim())) throw new Error("Alamat token tidak valid.");
      if (totalEther() <= 0) throw new Error("Isi jumlah dana (total > 0) dulu.");
      const signer = await requireSigner();
      const rc = await chain.approveToken(signer, token.trim(), totalEther().toFixed(18));
      pushLog(`Token di-approve: ${rc.hash}`);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  const onCreateEscrow = async () => {
    try {
      setError(null);
      if (!recipient.trim()) throw new Error("Isi alamat penerima (recipient).");
      if (!ethers.isAddress(recipient.trim())) throw new Error("Alamat penerima tidak valid.");
      if (!ethers.isAddress(token.trim())) throw new Error("Alamat token tidak valid.");
      if (wrongChain) throw new Error(`Kontrak aktif di chain ${currentChain}, bukan ${chainId}.`);
      if (milestones.length < 1 || milestones.length > MAX_MILESTONES) {
        throw new Error(`Jumlah milestone 1..${MAX_MILESTONES}.`);
      }
      if (milestones.some((m) => (parseFloat(m.amount) || 0) <= 0 || !m.requirement.trim())) {
        throw new Error("Setiap milestone butuh jumlah > 0 dan deskripsi kriteria.");
      }
      setBusy("create");
      const signer = await requireSigner();
      const { escrowId, receipt } = await chain.createEscrow(
        signer,
        recipient.trim(),
        token.trim(),
        milestones.map((m) => ({ amount: m.amount, requirement: m.requirement }))
      );
      if (escrowId !== null && project.trim()) saveProject(escrowId, project.trim());
      pushLog(`Escrow dibuat: ${receipt.hash} · id ${escrowId}`);
      setCreated({ id: escrowId, hash: receipt.hash });
      setRecipient("");
      setProject("");
      setToken("");
      setMilestones([{ amount: "", requirement: "" }]);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Layout role="payer" title="Buat Escrow"
      subtitle="Payer mengunci dana untuk milestone — di-sign langsung wallet" active="/payer/create">
      {created && (
        <section className="card successCard">
          <h3>Escrow #{created.id} dibuat</h3>
          <div className="meta">
            <b style={{ color: "var(--text)" }}>Escrow ID: {created.id}</b> — catat ID ini dan bagikan
            ke worker supaya mereka bisa submit bukti.
          </div>
          <div className="meta">Tx: {created.hash.slice(0, 22)}…</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => router.push("/payer")}>Ke Dashboard</button>
            <button className="btn btn-ghost" onClick={() => setCreated(null)}>Buat lagi</button>
          </div>
        </section>
      )}

      <section className="card formCard">
        <div className="field">
          <label>Alamat pembuat (payer)</label>
          <input value={account || ""} readOnly placeholder="Menunggu wallet…" />
          <div className="formHint">Otomatis = wallet yang sedang terhubung.</div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Alamat penerima (recipient)</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" />
          </div>
          <div className="field">
            <label>Nama project</label>
            <input value={project} onChange={(e) => setProject(e.target.value)}
              placeholder="mis. Landing page v2" />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Alamat token (ERC20)</label>
            <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="0x…" />
          </div>
          <div className="field">
            <label>Chain</label>
            <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.label} ({c.id})</option>
              ))}
            </select>
            <div className="formHint">
              Default BSC Testnet. {wrongChain
                ? `Kontrak aktif di chain ${currentChain} — pilih ${currentChain} agar tx berhasil.`
                : `App berjalan di chain ${currentChain} sesuai .env.`}
            </div>
          </div>
        </div>

        <div className="field">
          <label>
            Milestone ({milestones.length}/{MAX_MILESTONES}) — jumlah token + kriteria
          </label>
          {milestones.map((m, i) => (
            <div className="grid2" key={i} style={{ marginBottom: 8 }}>
              <input value={m.amount} onChange={(e) => setMilestone(i, { amount: e.target.value })}
                placeholder="Jumlah" />
              <div className="row" style={{ gap: 6 }}>
                <input value={m.requirement}
                  onChange={(e) => setMilestone(i, { requirement: e.target.value })}
                  placeholder="Deskripsi kriteria (teks bebas)" />
                <button className="btn btn-danger sm" type="button"
                  onClick={() => removeMilestone(i)} disabled={milestones.length === 1}>
                  Hapus
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost sm" onClick={addMilestone}
            disabled={milestones.length >= MAX_MILESTONES}>
            + Tambah milestone
          </button>
          <div className="meta" style={{ marginTop: 8 }}>
            Total dana dikunci: <b style={{ color: "var(--text)" }}>{totalEther().toFixed(4)} token</b>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={onApproveToken} disabled={Boolean(busy)}>
            Approve (jumlah)
          </button>
          <button className="btn btn-ghost" onClick={onApproveMax} disabled={Boolean(busy)}>
            Approve (infinite)
          </button>
          <button className="btn" onClick={onCreateEscrow} disabled={Boolean(busy)}>
            Buat Escrow
          </button>
        </div>
        <div className="formHint" style={{ marginTop: 8 }}>
          "Approve (jumlah)" meng-approve total dana escrow ini saja — paling aman.
          "Approve (infinite)" mengunci allowance tak terbatas untuk kontrak ini dan
          ke semua escrow berikutnya — pakai hanya kalau kamu memahami risikonya.
          Semua tx di-sign langsung wallet anda (bukan lewat backend).
        </div>
      </section>
    </Layout>
  );
}