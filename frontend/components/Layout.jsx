// Role page layout (payer / worker): sidebar navigation + topbar with
// WalletChip + global error banner. Wallet state comes from context (lib/wallet.jsx).
import { useState } from "react";
import Link from "next/link";
import { FxBackground, BrandMark } from "./fx";
import * as chain from "../lib/contract";
import { useWallet } from "../lib/wallet";
import { IconDashboard, IconCreate, IconSubmit, IconTx } from "./bits";
import WalletChip from "./WalletChip";

const isConfigured = () =>
  chain.CONTRACT_ADDRESS &&
  chain.CONTRACT_ADDRESS !== "0x0000000000000000000000000000000000000000";

export default function Layout({ role, title, subtitle, active, children }) {
  const { error, account, onTarget, busy, onSwitchNetwork } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  const nav =
    role === "payer"
      ? [
          { label: "Dashboard", href: "/payer", icon: <IconDashboard /> },
          { label: "Create Escrow", href: "/payer/create", icon: <IconCreate /> },
          { label: "Transactions", href: "/payer/transactions", icon: <IconTx /> },
        ]
      : [
          { label: "Dashboard", href: "/worker", icon: <IconDashboard /> },
          { label: "Submit Proof", href: "/worker/submit", icon: <IconSubmit /> },
          { label: "Transactions", href: "/worker/transactions", icon: <IconTx /> },
        ];

  return (
    <div className="app">
      <FxBackground />
      <aside className="sidebar">
        <div className="brand"><BrandMark /> Mile<em>AI</em></div>
        <div className="roleTag">{role === "payer" ? "Role: Payer" : "Role: Worker"}</div>
        <button
          type="button"
          className={`hamburger ${menuOpen ? "open" : ""}`}
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
        >
          <span /><span /><span />
        </button>
        <nav className={`nav ${menuOpen ? "open" : ""}`} aria-label="Main menu">
          {nav.map((it) => (
            <Link key={it.href} href={it.href} onClick={() => setMenuOpen(false)}
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
          <WalletChip />
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

        {account && !onTarget && (
          <div className="netwarn">
            <span>
              Wallet is on the wrong network — off-chain reads work, but
              transactions (approve / create / refund) will fail. Switch to chain{" "}
              {chain.TARGET_CHAIN_ID}.
            </span>
            <button className="btn btn-ghost sm" onClick={onSwitchNetwork} disabled={Boolean(busy)}>
              Switch Network
            </button>
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