// Wallet picker modal (EIP-6963) — rendered globally in _app.js, so it can be
// opened from any page (e.g., landing after the user picks a role).
import { useWallet } from "../lib/wallet";

export default function WalletPicker() {
  const { walletProviders, activeProvider, account, busy, connectNow, setPickerOpen } = useWallet();
  return (
    <div className="pickerBackdrop" onClick={() => setPickerOpen(false)}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <h3>Connect wallet</h3>
        <p className="meta">
          Pick a wallet extension to connect. {walletProviders.length} wallets detected (EIP-6963).
        </p>
        {walletProviders.length === 0 && (
          <p className="error" style={{ margin: 0 }}>
            No wallet extension detected. Install MetaMask / Rabby / etc., then reload the page.
          </p>
        )}
        {walletProviders.map((w) => {
          const isActive = w.provider === activeProvider;
          const matches = account && activeProvider === w.provider;
          return (
            <button className="pickerItem" key={w.info.rdns} disabled={Boolean(busy)}
              onClick={() => { setPickerOpen(false); connectNow(w.provider); }}>
              {w.info.icon && (
                <img className="pickerIcon" src={w.info.icon} alt={w.info.name} />
              )}
              <span>{w.info.name}</span>
              {isActive && matches && <em className="pickerActive">active</em>}
            </button>
          );
        })}
        {busy === "connect" && <div className="meta" style={{ margin: "8px 0 0" }}>Connecting wallet…</div>}
      </div>
    </div>
  );
}