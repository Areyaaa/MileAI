// ============================================================================
// Create Escrow (Payer).
//
// Form: creator address (auto = active wallet), recipient address, project name,
// ERC20 token address, chain (default = target), milestone list (token amount
// + criteria). Approve the token first, then Create Escrow.
// On success: show the ESCROW ID from the EscrowCreated event in the receipt.
// Project name stored in localStorage (design decision — contract/backend do
// not have a project field).
// ============================================================================
import { useState } from "react";
import { ethers } from "ethers";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { useWallet } from "../../lib/wallet";
import * as chain from "../../lib/contract";
import { saveProject } from "../../lib/projects";
import { addTxLog } from "../../lib/txlog";
import { KNOWN_TOKENS, TOKEN_CUSTOM } from "../../lib/tokens";

const MAX_MILESTONES = 10;
const CHAINS = [
  { id: 97, label: "BSC Testnet" },
  { id: 31337, label: "Local Anvil (dev)" },
];
const currentChain = chain.TARGET_CHAIN_ID;

export default function PayerCreate() {
  const { account, requireSigner, pushLog, setError, busy, setBusy } = useWallet();
  const router = useRouter();

  const [recipient, setRecipient] = useState("");
  const [project, setProject] = useState("");
  const [tokenChoice, setTokenChoice] = useState("0");
  const [tokenCustom, setTokenCustom] = useState("");
  const [chainId, setChainId] = useState(String(currentChain));
  const [milestones, setMilestones] = useState([{ amount: "", requirement: "" }]);
  const [created, setCreated] = useState(null);

  const totalEther = () => milestones.reduce((a, m) => a + (parseFloat(m.amount) || 0), 0);

  // Alamat token akhir: preset dari KNOWN_TOKENS, atau input teks jika pilihan
  // "Custom address…" dipilih.
  const resolvedToken = () => {
    if (tokenChoice === TOKEN_CUSTOM) return tokenCustom.trim();
    const preset = KNOWN_TOKENS[Number(tokenChoice)];
    return preset ? preset.address : "";
  };
  const isCustomToken = tokenChoice === TOKEN_CUSTOM;

  const setMilestone = (i, patch) =>
    setMilestones((arr) => arr.map((m, k) => (k === i ? { ...m, ...patch } : m)));
  const addMilestone = () =>
    setMilestones((arr) => (arr.length < MAX_MILESTONES ? [...arr, { amount: "", requirement: "" }] : arr));
  const removeMilestone = (i) =>
    setMilestones((arr) => (arr.length > 1 ? arr.filter((_, k) => k !== i) : arr));

  const wrongChain = Number(chainId) !== currentChain;

  const MILE_TOKEN = KNOWN_TOKENS[0].address;

  const onGetMile = async () => {
    try {
      setError(null);
      setBusy("mint");
      const signer = await requireSigner();
      const rc = await chain.mintTestToken(signer, MILE_TOKEN, "5000");
      pushLog(`Minted 5000 MILE: ${rc.hash}`);
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
      const tokenAddr = resolvedToken();
      if (!ethers.isAddress(tokenAddr)) throw new Error("Invalid token address.");
      if (totalEther() <= 0) throw new Error("Enter an amount to lock first (total > 0).");
      const signer = await requireSigner();
      const rc = await chain.approveToken(signer, tokenAddr, totalEther().toFixed(18));
      pushLog(`Token approved: ${rc.hash}`);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  const onCreateEscrow = async () => {
    try {
      setError(null);
      const tokenAddr = resolvedToken();
      if (!recipient.trim()) throw new Error("Fill in the recipient address.");
      if (!ethers.isAddress(recipient.trim())) throw new Error("Invalid recipient address.");
      if (!ethers.isAddress(tokenAddr)) throw new Error("Invalid token address.");
      if (wrongChain) throw new Error(`Contract is active on chain ${currentChain}, not ${chainId}.`);
      if (milestones.length < 1 || milestones.length > MAX_MILESTONES) {
        throw new Error(`Milestone count must be 1..${MAX_MILESTONES}.`);
      }
      if (milestones.some((m) => (parseFloat(m.amount) || 0) <= 0 || !m.requirement.trim())) {
        throw new Error("Each milestone needs an amount > 0 and a criteria description.");
      }
      setBusy("create");
      const signer = await requireSigner();
      const { escrowId, receipt } = await chain.createEscrow(
        signer,
        recipient.trim(),
        tokenAddr,
        milestones.map((m) => ({ amount: m.amount, requirement: m.requirement }))
      );
      if (escrowId !== null && project.trim()) saveProject(escrowId, project.trim());
      pushLog(`Escrow created: ${receipt.hash} · id ${escrowId}`);
      addTxLog("create", {
        hash: receipt.hash,
        escrowId,
        amountEther: totalEther().toFixed(2),
      });
      setCreated({ id: escrowId, hash: receipt.hash });
      setRecipient("");
      setProject("");
      setTokenChoice("0");
      setTokenCustom("");
      setMilestones([{ amount: "", requirement: "" }]);
    } catch (e) {
      setError((e && e.message) || String(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Layout role="payer" title="Create Escrow"
      subtitle="Payer locks funds for milestones — signed directly by your wallet" active="/payer/create">
      {created && (
        <section className="card successCard">
          <h3>Escrow #{created.id} created</h3>
          <div className="meta">
            <b style={{ color: "var(--text)" }}>Escrow ID: {created.id}</b> — keep this ID and share
            it with workers so they can submit proof.
          </div>
          <div className="meta">Tx: {created.hash.slice(0, 22)}…</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={() => router.push("/payer")}>Go to Dashboard</button>
            <button className="btn btn-ghost" onClick={() => setCreated(null)}>Create another</button>
          </div>
        </section>
      )}

      <section className="card formCard">
        <div className="field">
          <label>Creator address (payer)</label>
          <input value={account || ""} readOnly placeholder="Waiting for wallet…" />
          <div className="formHint">Automatically set to the connected wallet.</div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Recipient address</label>
            <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x…" />
          </div>
          <div className="field">
            <label>Project name</label>
            <input value={project} onChange={(e) => setProject(e.target.value)}
              placeholder="e.g., Landing page v2" />
          </div>
        </div>

        <div className="grid2">
          <div className="field">
            <label>Token address (ERC20)</label>
            <select value={tokenChoice} onChange={(e) => setTokenChoice(e.target.value)}>
              {KNOWN_TOKENS.map((t, i) => (
                <option key={t.address} value={String(i)}>{t.label}</option>
              ))}
              <option value={TOKEN_CUSTOM}>Custom address…</option>
            </select>
            {isCustomToken && (
              <input value={tokenCustom} onChange={(e) => setTokenCustom(e.target.value)}
                placeholder="0x…" style={{ marginTop: 6 }} />
            )}
          </div>
          <div className="field">
            <label>Chain</label>
            <select value={chainId} onChange={(e) => setChainId(e.target.value)}>
              {CHAINS.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.label} ({c.id})</option>
              ))}
            </select>
            <div className="formHint">
              {wrongChain
                ? `Contract is on chain ${currentChain} — pick ${currentChain} for the tx to succeed.`
                : ""}
            </div>
          </div>
        </div>

        <div className="field">
          <label>
            Milestones ({milestones.length}/{MAX_MILESTONES}) — token amount + criteria
          </label>
          {milestones.map((m, i) => (
            <div className="grid2" key={i} style={{ marginBottom: 8 }}>
              <input value={m.amount} onChange={(e) => setMilestone(i, { amount: e.target.value })}
                placeholder="Amount" />
              <div className="row" style={{ gap: 6 }}>
                <input value={m.requirement}
                  onChange={(e) => setMilestone(i, { requirement: e.target.value })}
                  placeholder="Criteria description (free text)" />
                <button className="btn btn-danger sm" type="button"
                  onClick={() => removeMilestone(i)} disabled={milestones.length === 1}>
                  Remove
                </button>
              </div>
            </div>
          ))}
          <button className="btn btn-ghost sm" onClick={addMilestone}
            disabled={milestones.length >= MAX_MILESTONES}>
            + Add milestone
          </button>
          <div className="meta" style={{ marginTop: 8 }}>
            Total funds to lock: <b style={{ color: "var(--text)" }}>{totalEther().toFixed(4)} token</b>
          </div>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" onClick={onApproveToken} disabled={Boolean(busy)}>
            Approve (exact)
          </button>
          <button className="btn" onClick={onCreateEscrow} disabled={Boolean(busy)}>
            Create Escrow
          </button>
        </div>
        <div className="formHint" style={{ marginTop: 8 }}>
          "Approve (exact)" approves only this escrow's total funds — safest.
          All transactions are signed directly by your wallet (not via the backend).
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn btn-ghost sm" onClick={onGetMile} disabled={Boolean(busy)}>
            Get Mile (5000) — mint test tokens to your wallet
          </button>
        </div>
      </section>
    </Layout>
  );
}