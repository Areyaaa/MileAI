// Milestone detail popup — shown when a milestone row is clicked on the worker
// dashboard. Reuses the wallet-picker backdrop style, but as a wider modal.
// The "Submit Proof" button only appears for Pending milestones and routes to
// the worker submit page with escrow + milestone prefilled (integration).
import * as chain from "../lib/contract";
import { StatusBadge, CircularConfidence, ReasonExpander, TokenSymbol, fmtAddr } from "./bits";

export default function MilestoneModal({ escrow, m, ai, projectName, provider, onClose, onGoSubmit }) {
  const { id, data } = escrow;
  const ver = (ai && ai.ver) || {};
  const display = (ai && ai.display) || chain.STATUS[m.status] || String(m.status);
  const showConf = ver.confidence !== undefined;
  const tx = ver.tx_hash;
  const pending = m.status === chain.STATUS_PENDING;
  const canSubmit = pending && typeof onGoSubmit === "function";

  return (
    <div className="pickerBackdrop" onClick={onClose}>
      <div className="picker milestoneModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <h3>
            Escrow #{id} · Milestone {m.index}
          </h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="meta">{projectName || "Unnamed project"} · Milestone {m.index} of {data.milestones.length}</p>

        <div className="user-grid">
          <div>Payer: <span>{fmtAddr(data.payer)}</span></div>
          <div>Recipient: <span>{fmtAddr(data.recipient)}</span></div>
          <div>Token: <span><TokenSymbol provider={provider} token={data.token} /></span></div>
          <div>Amount: <span>{m.amountEther} token</span></div>
        </div>

        <div className="modalStatus">
          <StatusBadge label={display} />
          {showConf && Math.round(Number(ver.confidence) || 0) >= 0 && (
            <CircularConfidence value={ver.confidence} />
          )}
        </div>

        <div className="modalSection">
          <b>Criteria:</b>
          <p>{m.proofRequirement}</p>
        </div>

        {m.proofText && (
          <div className="modalSection">
            <b>Proof:</b>
            <p className="proofText">{m.proofText}</p>
          </div>
        )}

        <ReasonExpander reason={ver.reason} />

        {tx && (
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

        {ai && ai.backendError && (
          <div className="error">AI verdict unavailable (backend off): {ai.backendError}</div>
        )}

        <div className="modalActions">
          {canSubmit ? (
            <button className="btn" onClick={() => onGoSubmit(id, m.index)}>
              Submit Proof
            </button>
          ) : (
            <span className="meta">View-only popup — details above.</span>
          )}
        </div>
      </div>
    </div>
  );
}