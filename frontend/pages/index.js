// ============================================================================
// Landing — one-page ala Fates: setiap putaran scroll adalah "babak".
//   001 HERO        — headline + token 3D, memudar saat scroll (parallax)
//   002 MASALAH     — pain points pembayaran proyek manual
//   003 CARA KERJA  — pinned story stack (5 langkah, slide berganti) ala Fates
//   004 PILIH PERAN — role selection -> popup connect wallet -> redirect
// Walet state global (lib/wallet.jsx). Semua tx user di-sign langsung dari
// wallet (lib/contract.js), backend hanya produce AI verdict.
// ============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  FxBackground,
  BrandMark,
  Coin3D,
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

// Ikon role (inline SVG — pengganti emoji).
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
  { t: "Approval manusia", d: "Menunggu review manusia bikin proyek macet — dana kepegang, progress stuck berbulan-bulan." },
  { t: "Bukti diragukan", d: "Hasil kerja diperdebatkan oleh opini, bukan fakta yang bisa diverifikasi siapa pun." },
  { t: "Trust tanpa jaminan", d: "Worker takut nggak dibayar, payer takut dana kabur. Keduanya main untung-untungan." },
];

const STEPS = [
  {
    title: "Pilih peran & connect wallet",
    body: "Tentukan kamu Payer atau Worker, lalu hubungkan wallet (EIP-6963). Semua transaksi tetap di-sign langsung dari wallet kamu — backend tidak pernah pegang private key user.",
  },
  {
    title: "Payer mengunci dana",
    body: "Pilih token, tentukan milestone, tulis kriteria tiap tahap. Dana escrow masuk smart contract MilestoneEscrow di BNB Smart Chain Testnet.",
  },
  {
    title: "Worker kirim bukti kerja",
    body: "Setiap tahap selesai, kirim teks bukti + link. Bukti masuk on-chain — transparan, siapa pun bisa lihat.",
  },
  {
    title: "AI Agent verifikasi",
    body: "Backend polling status 'Submitted', kirim kriteria vs bukti ke LLM (Groq/Gemini). Keluarnya confidence 0–100 + alasan singkat.",
  },
  {
    title: "Dana cair otomatis",
    body: "Confidence ≥ 85 → autoRelease tanpa approval manusia. AI ragu? Payer bisa approve manual, atau refund sisa dana.",
  },
];

const MARQUEE_1 = ["Dana terkunci", "AI verifikasi", "Milestone", "BSC Testnet", "Escrow on-chain"];
const MARQUEE_2 = ["Milestone", "Confidence 85+", "Auto release", "Proof on-chain"];

export default function Home() {
  const { provider, onTarget, busy, onConnect } = useWallet();
  const router = useRouter();
  const [pendingRole, setPendingRole] = useState(null);

  // Setelah wallet connect, otomatis masuk ke peran yang barusan dipilih.
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
      onConnect(); // popup connect wallet (langkah 2)
    }
  };

  return (
    <div className="landing">
      <FxBackground />
      <ScrollProgress />

      <header className="landingHead">
        <div className="brand landingBrand"><BrandMark size={28} /> Mile<em>AI</em></div>
        <nav className="lndNav" aria-label="Navigasi halaman">
          <a href="#masalah">001</a>
          <a href="#cara-kerja">002</a>
          <a href="#pilih-peran">003</a>
          <span className="lndNet">BSC Testnet</span>
        </nav>
      </header>

      {/* ============================================================ 001 HERO */}
      <section className="lnd lnd-hero">
        <div className="hero-inner">
          <Parallax speed={-0.25} opacityOut className="hero">
            <span className="hero-kicker">AI Agent Escrow · BSC Testnet</span>
            <h1>Milestone escrow yang dicairkan oleh AI</h1>
            <p>
              Dana dikunci di smart contract BNB Smart Chain, terbagi per milestone.
              Worker kirim bukti kerja, AI Agent verifikasi secara otonom, dan dana
              cair — tanpa approval manusia. Fallback approve manual tersedia kalau AI ragu.
            </p>
          </Parallax>
          <Parallax speed={-0.12}>
            <div className="coinwrap"><Coin3D size={220} /></div>
          </Parallax>
        </div>
        <div className="scroll-hint"><i /><span>Scroll</span></div>
      </section>

      <Marquee items={MARQUEE_1} />

      {/* ======================================================= 002 MASALAH */}
      <section className="lnd lnd-problem" id="masalah">
        <div className="bigNum">002</div>
        <div className="lnd-inner">
          <div className="lndH">
            <span className="lndH-num">002 / MASALAH</span>
            <span className="lndH-rule" />
          </div>
          <Reveal>
            <h2 className="lnd-h2">Pembayaran proyek jalannya “nanti-nanti”</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="lnd-lead">
              Hampir semua kerja jarak jauh bergantung pada kepercayaan antar dua pihak
              yang nggak saling kenal. Hasilnya: dana kepegang, bukti diperdebatkan,
              dan deadline molor.
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

      {/* ==================================================== 003 CARA KERJA */}
      <section className="lnd lnd-how" id="cara-kerja">
        <div className="bigNum">003</div>
        <StoryStack steps={STEPS} />
      </section>

      {/* ==================================================== 004 PILIH PERAN */}
      <section className="lnd lnd-roles" id="pilih-peran">
        <div className="lnd-inner">
          <div className="lndH">
            <span className="lndH-num">004 / PILIH PERAN</span>
            <span className="lndH-rule" />
          </div>
          <Reveal>
            <h2 className="lnd-h2">Sekarang, gantian kamu</h2>
          </Reveal>
          <Reveal delay={80}>
            <p className="lnd-lead">
              Pilih peran — popup connect wallet langsung muncul, dan kamu akan
              dialihkan otomatis setelah tersambung.
            </p>
          </Reveal>
          <div className="roleGrid">
            <Reveal delay={160}>
              <button className="roleCard" disabled={Boolean(busy)} onClick={() => choose("payer")}>
                <div className="roleIcon"><RoleIcon kind="payer" /></div>
                <h3>Join as Payer</h3>
                <p>
                  Buat escrow dengan milestone, kunci dana, pantau verifikasi AI
                  (confidence + alasan), approve manual & refund bila perlu.
                </p>
                <span className="roleGo">Pilih →</span>
              </button>
            </Reveal>
            <Reveal delay={260}>
              <button className="roleCard" disabled={Boolean(busy)} onClick={() => choose("worker")}>
                <div className="roleIcon"><RoleIcon kind="worker" /></div>
                <h3>Join as Worker</h3>
                <p>
                  Lihat escrow yang kamu kerjakan, submit bukti kerja, dan terima
                  pencairan dana otomatis dari AI.
                </p>
                <span className="roleGo">Pilih →</span>
              </button>
            </Reveal>
          </div>

          {provider && !onTarget && (
            <div className="netwarn" style={{ marginTop: 18 }}>
              <span>Wallet di network salah — interaksi diblokir sampai pindah ke chain {chain.TARGET_CHAIN_ID}.</span>
              <SwitchNetworkButton />
            </div>
          )}
        </div>
      </section>

      <HashTicker />

      <footer className="lnd-foot">
        <div className="lnd-foot-brand"><BrandMark size={20} /> Mile<em>AI</em></div>
        <span className="meta">
          Milestone escrow otonom · BNB Smart Chain Testnet · AI Agent verifikasi · 1 dev, hackathon BNB Chain
        </span>
      </footer>
    </div>
  );
}