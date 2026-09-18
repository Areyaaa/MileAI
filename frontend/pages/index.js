// ============================================================================
// Landing — one-page Fates-style: every scroll turn is a "act".
//   001 HERO        — headline + 3D token, fades on scroll (parallax)
//   002 PROBLEM     — pain points of manual project payments
//   003 HOW IT WORKS — pinned story stack (5 steps, slides change) Fates-style
//   004 CHOOSE ROLE — role selection -> connect wallet popup -> redirect
// Global wallet state (lib/wallet.jsx). All user txs are signed directly from
// the wallet (lib/contract.js); the backend only produces AI verdicts.
// ============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  FxBackground,
  BrandMark,
  Logo3D,
  FloatingCoins,
  Reveal,
  HashTicker,
  Marquee,
  Parallax,
  StoryStack,
  ScrollProgress,
} from "../components/fx";
import { useWallet } from "../lib/wallet";
import * as chain from "../lib/contract";

function SwitchNetworkButton() {
  const { onSwitchNetwork, busy } = useWallet();
  return (
    <button className="btn btn-ghost sm" onClick={onSwitchNetwork} disabled={Boolean(busy)}>
      Switch Network
    </button>
  );
}

// Role icon (inline SVG — instead of emoji).
const RoleIcon = ({ kind }) => (
  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {kind === "payer" ? (
      <>
        <path d="M12 2 4 5.2v6.1c0 4.9 3.4 9.4 8 10.7 4.6-1.3 8-5.8 8-10.7V5.2L12 2Z" />
        <path d="M9 12l2 2 4-5" />
      </>
    ) : (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2.5" />
        <path d="M12 2v2" />
        <path d="M9 10h6" />
        <path d="m12 10 1 1 2-2" />
        <path d="M9 15h6" />
        <path d="m12 15 1 1 2-2" />
      </>
    )}
  </svg>
);

const PROBLEMS = [
  { t: "Human approval", d: "Waiting for human review stalls projects — funds sit locked and progress is stuck for months." },
  { t: "Disputed evidence", d: "Work output is argued over by opinions, not facts that anyone can verify." },
  { t: "Trust with no guarantee", d: "Workers fear they won't get paid; payers fear the funds will vanish. Both sides are gambling." },
];

const STEPS = [
  {
    title: "Pick a role & connect wallet",
    body: "Decide whether you're a Payer or Worker, then connect your wallet (EIP-6963). All transactions are still signed directly from your wallet — the backend never holds user private keys.",
  },
  {
    title: "Payer locks funds",
    body: "Choose a token, set milestones, write the criteria for each stage. Escrow funds go into the MilestoneEscrow smart contract on BNB Smart Chain Testnet.",
  },
  {
    title: "Worker submits proof of work",
    body: "When a stage is done, submit proof text + link. The proof goes on-chain — transparent, anyone can see it.",
  },
  {
    title: "AI Agent verifies",
    body: "The backend polls for 'Submitted' status and sends criteria vs proof to the LLM (Groq/Gemini). Output: a 0–100 confidence score + short reason.",
  },
  {
    title: "Funds release automatically",
    body: "Confidence ≥ 85 → autoRelease with no human approval. AI not sure? The payer can approve manually, or refund the remaining funds.",
  },
];

const MARQUEE_1 = ["Funds locked", "AI verification", "Milestone", "BSC Testnet", "On-chain escrow"];
const MARQUEE_2 = ["Milestone", "Confidence 85+", "Auto release", "Proof on-chain"];

export default function Home() {
  const { provider, onTarget, busy, onConnect } = useWallet();
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState(null);

  // After wallet connect, automatically enter the role that was just chosen.
  useEffect(() => {
    if (provider && pendingRole) {
      router.push(pendingRole === "payer" ? "/payer" : "/worker");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, pendingRole]);

  const choose = (role) => {
    if (busy) return;
    if (provider) {
      router.push(role === "payer" ? "/payer" : "/worker");
    } else {
      setPendingRole(role);
      onConnect(); // connect wallet popup (step 2)
    }
  };

  return (
    <div className="landing">
      <FxBackground />
      <ScrollProgress />

      <header className="landingHead">
        <div className="brand landingBrand"><Logo3D size={36} /> <span>Mile<em>AI</em></span></div>
        <nav className="lndNav" aria-label="Page navigation">
          <a href="#masalah">001</a>
          <a href="#cara-kerja">002</a>
          <a href="#pilih-peran">003</a>
          <span className="lndNet">BSC Testnet</span>
        </nav>
      </header>

      {/* ============================================================ 001 HERO */}
      <section className="lnd lnd-hero">
        <FloatingCoins count={10} />
        <div className="hero-inner">
          <Parallax speed={-0.25} opacityOut className="hero">
            <span className="hero-kicker">AI Agent Escrow · BSC Testnet</span>
            <h1>Milestone escrow released by AI</h1>
            <p>
              Funds locked in a BNB Smart Chain contract, split per milestone.
              Workers submit proof of work, the AI Agent verifies autonomously,
              and funds are released — no human approval. A manual approve
              fallback is available if the AI is unsure.
            </p>
          </Parallax>
          <Parallax speed={-0.12}>
            <div className="logo3d-hero-wrap">
              <Logo3D size={300} tilt />
            </div>
          </Parallax>
        </div>
        <div className="scroll-hint"><i /><span>Scroll</span></div>
      </section>

      <Marquee items={MARQUEE_1} />

      {/* ======================================================= 002 PROBLEM */}
      <section className="lnd lnd-problem" id="masalah">
        <div className="bigNum">002</div>
        <div className="lnd-inner">
          <div className="lndH">
            <span className="lndH-num">002 / PROBLEM</span>
            <span className="lndH-rule" />
          </div>
          <Reveal>
            <h2 className="lnd-h2">Project payments keep getting delayed</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="lnd-lead">
              Almost all remote work depends on trust between two parties
              who don't know each other. The result: funds get stuck, proof
              is disputed, and deadlines slip.
            </p>
          </Reveal>
          <Reveal delay={160}>
            <div className="probGrid">
              {PROBLEMS.map((p) => (
                <div className="probCard" key={p.t}>
                  <h4>{p.t}</h4>
                  <p>{p.d}</p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <Marquee items={MARQUEE_2} />

      {/* ==================================================== 003 HOW IT WORKS */}
      <section className="lnd lnd-how" id="cara-kerja">
        <div className="bigNum">003</div>
        <StoryStack steps={STEPS} />
      </section>

      {/* ==================================================== 004 CHOOSE ROLE */}
      <section className="lnd lnd-roles" id="pilih-peran">
        <div className="lnd-inner">
          <div className="lndH">
            <span className="lndH-num">004 / CHOOSE A ROLE</span>
            <span className="lndH-rule" />
          </div>
          <Reveal>
            <h2 className="lnd-h2">Now it's your turn</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="lnd-lead">
              Pick a role — a connect wallet popup appears right away, and
              you'll be redirected automatically once connected.
            </p>
          </Reveal>
          <div className="roleGrid">
            <Reveal delay={160}>
              <button className="roleCard" disabled={Boolean(busy)} onClick={() => choose("payer")}>
                <div className="roleIcon"><RoleIcon kind="payer" /></div>
                <h3>Join as Payer</h3>
                <p>
                  Create a milestone escrow, lock funds, monitor AI verification
                  (confidence + reason), approve manually & refund if needed.
                </p>
                <span className="roleGo">Choose →</span>
              </button>
            </Reveal>
            <Reveal delay={260}>
              <button className="roleCard" disabled={Boolean(busy)} onClick={() => choose("worker")}>
                <div className="roleIcon"><RoleIcon kind="worker" /></div>
                <h3>Join as Worker</h3>
                <p>
                  View the escrows you're working on, submit proof of work, and
                  receive automatic fund releases from the AI.
                </p>
                <span className="roleGo">Choose →</span>
              </button>
            </Reveal>
          </div>

          {provider && !onTarget && (
            <div className="netwarn" style={{ marginTop: 18 }}>
              <span>Wallet is on the wrong network — interactions are blocked until you switch to chain {chain.TARGET_CHAIN_ID}.</span>
              <SwitchNetworkButton />
            </div>
          )}
        </div>
      </section>

      <HashTicker />

      <footer className="lnd-foot">
        <div className="lnd-foot-brand"><Logo3D size={28} /> <span>Mile<em>AI</em></span></div>
        <span className="meta">
          Autonomous milestone escrow · BNB Smart Chain Testnet · AI Agent verification · 1 dev, BNB Chain hackathon
        </span>
      </footer>
    </div>
  );
}