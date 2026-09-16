// Layout role-halaman (payer / worker): sidebar navigasi + topbar dengan
// WalletChip + banner error global. Wallet state dari context (lib/wallet.jsx).
import Link from "next/link";
import { FxBackground, BrandMark } from "./fx";
import * as chain from "../lib/contract";
import { useWallet } from "../lib/wallet";
import { IconDashboard, IconCreate, IconSubmit } from "./bits";

const isConfigured = () =>
  chain.CONTRACT_ADDRESS &&
  chain.CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

export default function Layout({ role, title, subtitle, active, children }) {
  const { error, account } = useWallet();

  const nav =
    role === "payer"
      ? [
          { label: "Dashboard", href: "/payer", icon: <IconDashboard /> },
          { label: "Buat Escrow", href: "/payer/create", icon: <IconCreate /> },
        ]
      : [
          { label: "Dashboard", href: "/worker", icon: <IconDashboard /> },
          { label: "Submit Bukti", href: "/worker/submit", icon: <IconSubmit /> },
        ];

  return (
    <div className="app">
      <FxBackground />
      <aside className="sidebar">
        <div className="brand"><BrandMark /> Mile<em>AI</em></div>
        <div className="roleTag">{role === "payer" ? "Peran: Payer" : "Peran: Worker"}</div>
        <nav className="nav" aria-label="Menu utama">
          {nav.map((it) => (
            <Link key={it.href} href={it.href}
              className={`navItem ${active === it.href ? "active" : ""}`}>
              {it.icon} {it.label}
            </Link>
          ))}
        </nav>
        <div className="sidebarNote">
          {chain.TARGET_CHAIN_ID === 97 ? "BSC Testnet" : "Anvil lokal"} · chain {chain.TARGET_CHAIN_ID}
          {account && <><br />{account.slice(0, 6)}…{account.slice(-4)}</>}
          <br />
          <Link href="/" className="link">↺ Ganti peran / pilih ulang</Link>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="pageTitle">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {!isConfigured() && (
          <div className="card">
            <div className="meta">
              <b style={{ color: "var(--amber)" }}>Belum dikonfigurasi.</b>{" "}
              NEXT_PUBLIC_CONTRACT_ADDRESS belum diisi di <code>frontend/.env.local</code>{" "}
              (isi hasil deploy testnet / anvil lokal, lihat .env.example). Halaman tetap
              bisa dirender, tapi interaksi kontrak akan gagal.
            </div>
          </div>
        )}

        {error && (
          <div className="card">
            <div className="error">{error}</div>
          </div>
        )}

        {children}
      </main>
    </div>
  );
}