// Role page layout (payer / worker): sidebar navigation + topbar with
// WalletChip + global error banner. Wallet state comes from context (lib/wallet.jsx).
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
          { label: "Create Escrow", href: "/payer/create", icon: <IconCreate /> },
        ]
      : [
          { label: "Dashboard", href: "/worker", icon: <IconDashboard /> },
          { label: "Submit Proof", href: "/worker/submit", icon: <IconSubmit /> },
        ];

  return (
    <div className="app">
      <FxBackground />
      <aside className="sidebar">
        <div className="brand"><BrandMark /> Mile<em>AI</em></div>
        <div className="roleTag">{role === "payer" ? "Role: Payer" : "Role: Worker"}</div>
        <nav className="nav" aria-label="Main menu">
          {nav.map((it) => (
            <Link key={it.href} href={it.href}
              className={`navItem ${active === it.href ? "active" : ""}`}>
              {it.icon} {it.label}
            </Link>
          ))}
        </nav>
        <div className="sidebarNote">
          {chain.TARGET_CHAIN_ID === 97 ? "BSC Testnet" : "Local Anvil"} · chain {chain.TARGET_CHAIN_ID}
          {account && <><br />{account.slice(0, 6)}…{account.slice(-4)}</>}
          <br />
          <Link href="/" className="link">↺ Switch role / re-select</Link>
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
              <b style={{ color: "var(--amber)" }}>Not configured.</b>{" "}
              NEXT_PUBLIC_CONTRACT_ADDRESS is not set in <code>frontend/.env.local</code>{" "}
              (fill in your testnet / local anvil deploy, see .env.example). The page still
              renders, but contract interactions will fail.
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