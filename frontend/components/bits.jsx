// Shared UI atoms (used by payer & worker dashboards): status badge, confidence
// radial, AI reason expand/collapse, one milestone row, icons, token symbol.
import { useEffect, useState } from "react";
import * as chain from "../lib/contract";

export const fmtAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "-");

// ---------------------- icons (inline, small) ----------------------
const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
export const IconDashboard = () => (
  <Icon d={<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>} />
);
export const IconCreate = () => (
  <Icon d={<><rect x="3" y="3" width="18" height="18" rx="4" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></>} />
);
export const IconSubmit = () => (
  <Icon d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>} />
);
export const IconTx = () => (
  <Icon d={<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>} />
);
export const IconWallet = () => (
  <Icon d={<><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>} />
);

// ---------------------- radial confidence ----------------------
export function CircularConfidence({ value, size = 54, stroke = 5 }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="conf" style={{ width: size, height: size }} title={`Confidence ${pct}/100`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--accent)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span>{Math.round(pct)}</span>
    </div>
  );
}

// ---------------------- status badge ----------------------
export function StatusBadge({ label }) {
  const t = label || "";
  let cls = "st-Pending";
  if (t.includes("Review")) cls = "st-Review";
  else if (t.includes("Cukup") || t.includes("Insufficient")) cls = "st-Insufficient";
  else if (t.includes("Error")) cls = "st-Error";
  else if (t.includes("Submitted")) cls = "st-Submitted";
  else if (t.includes("Released")) cls = "st-Released";
  else if (t.includes("Disputed")) cls = "st-Disputed";
  return <span className={`status-badge ${cls}`}>{t}</span>;
}

// ---------------------- AI reason (expand/collapse) ----------------------
export function ReasonExpander({ reason }) {
  const [open, setOpen] = useState(false);
  if (!reason) return null;
  const long = reason.length > 120;
  return (
    <div className="meta reason">
      <span className={open ? undefined : "clamp2"}>{reason}</span>
      {long && (
        <button className="link" onClick={() => setOpen((v) => !v)}>
          {open ? "Close" : "View full reason"}
        </button>
      )}
    </div>
  );
}

// ---------------------- token symbol (best-effort) ----------------------
const symCache = {};
export function TokenSymbol({ provider, token }) {
  const [sym, setSym] = useState(null);
  useEffect(() => {
    let alive = true;
    if (!token || !provider) return undefined;
    (async () => {
      if (symCache[token] !== undefined) {
        if (alive) setSym(symCache[token]);
        return;
      }
      try {
        const s = await chain.readTokenSymbol(provider, token);
        symCache[token] = s || null;
      } catch {
        symCache[token] = null;
      }
      if (alive) setSym(symCache[token]);
    })();
    return () => {
      alive = false;
    };
  }, [provider, token]);
  if (!token) return null;
  return sym || `${token.slice(0, 6)}…`;
}

// ---------------------- one milestone row ----------------------
export function MilestoneRow({ escrowId, m, ai, renderActions, onOpen }) {
  const ver = (ai && ai.ver) || {};
  const display = (ai && ai.display) || chain.STATUS[m.status] || String(m.status);
  const review = display === "Manual Review Needed";
  const showConf = ver.confidence !== undefined;
  const tx = ver.tx_hash;
  const clickable = typeof onOpen === "function";

  const handleClick = (e) => {
    if (!clickable) return;
    // Jangan buka popup kalau yang diklik tombol/tautan action (approve, refund, tx link).
    if (e.target.closest("button, a")) return;
    onOpen(m);
  };

  return (
    <div className={clickable ? "milestone clickable" : "milestone"}
      onClick={handleClick}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(m); } } : undefined}>
      <div className="msHead">
        <div>
          <div className="msTitle">
            Milestone {m.index}
            {clickable && <span className="cvHint">· click for detail ↗</span>}
          </div>
          <div className="amount">{m.amountEther} <span className="unit">token</span></div>
        </div>
        <div className="msRight">
          <StatusBadge label={display} />
          {showConf && Math.round(Number(ver.confidence) || 0) >= 0 && (
            <CircularConfidence value={ver.confidence} />
          )}
        </div>
      </div>
      <div className="meta" style={{ marginTop: 8 }}>
        <b>Criteria:</b> {m.proofRequirement}
      </div>

      {/* Rows yang membuka popup (clickable) tidak menampilkan detail inline — cukup ringkas
          dan rapi; detail lengkap (proof, reason, tx) tersedia di popup saat diklik. */}
      {!clickable && m.proofText && (
        <div className="meta"><b>Proof:</b> {m.proofText}</div>
      )}
      {!clickable && <ReasonExpander reason={ver.reason} />}
      {!clickable && tx && (
        <div className="ok">
          Release tx:{" "}
          {chain.EXPLORER_URL ? (
            <a href={chain.explorerTxUrl(tx)} target="_blank" rel="noreferrer">
              {`${tx.slice(0, 10)}…${tx.slice(-6)}`} ↗
            </a>
          ) : (
            tx
          )}
        </div>
      )}
      {!clickable && ai && ai.backendError && (
        <div className="error">AI verdict unavailable (backend off): {ai.backendError}</div>
      )}
      {renderActions && (
        <div className="row" style={{ marginTop: 10 }}>
          {renderActions({ display, review, submitted: m.status === chain.STATUS_SUBMITTED })}
        </div>
      )}
    </div>
  );
}