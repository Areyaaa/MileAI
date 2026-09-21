// Payer escrow detail popup — ditampilkan saat kartu escrow ringkas di dashboard
// payer diklik. Kartu hanya menampilkan ringkasan (id, nama, recipient, token);
// seluruh detail + aksi (approve manual, re-verify, refund) tersedia di popup ini
// yang scrollable. View Unicode: reuse gaya `.pickerBackdrop` + `.milestoneModal`.
import * as chain from "../lib/contract";
import { MilestoneRow, TokenSymbol, fmtAddr } from "./bits";

export default function PayerEscrowModal({ escrow, ai, projectName, provider, busy, onApprove, onRecheck, onRefund, onClose }) {
  const { id, data } = escrow;
  const releasedAll =
    data.milestones.length > 0 &&
    data.milestones.every((m) => m.status === chain.STATUS_RELEASED);
  const refundable = !data.refunded && !releasedAll;

  return (
    <div className="pickerBackdrop" onClick={onClose}>
      <div className="picker milestoneModal" onClick={(e) => e.stopPropagation()}>
        <div className="modalHead">
          <h3>Escrow #{id} · {projectName || "Unnamed project"}</h3>
          <button className="modalClose" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="meta">All milestones & actions (scrollable)</p>

        <div className="user-grid">
          <div>Payer: <span>{fmtAddr(data.payer)}</span></div>
          <div>Recipient: <span>{fmtAddr(data.recipient)}</span></div>
          <div>Token: <span><TokenSymbol provider={provider} token={data.token} /></span></div>
          <div>Refunded: <span>{String(data.refunded)}</span></div>
        </div>

        {data.milestones.map((m) => (
          <MilestoneRow key={m.index} escrowId={id} m={m} ai={ai[m.index]}
            renderActions={({ review, submitted }) => (
              <>
                {review && (
                  <button className="btn btn-ghost sm" onClick={() => onApprove(id, m.index)}
                    disabled={Boolean(busy)}>
                    Approve Manual
                  </button>
                )}
                {submitted && (
                  <button className="btn btn-ghost sm" onClick={() => onRecheck(id, m.index)}
                    disabled={Boolean(busy)}>
                    Re-verifikasi
                  </button>
                )}
              </>
            )} />
        ))}

        <div className="modalActions">
          {refundable ? (
            <button className="btn btn-danger" onClick={() => onRefund(id)} disabled={Boolean(busy)}>
              Refund Escrow
            </button>
          ) : data.refunded ? (
            <span className="badgeChain ok">Refunded</span>
          ) : (
            <span className="badgeChain ok">All released</span>
          )}
        </div>
      </div>
    </div>
  );
}