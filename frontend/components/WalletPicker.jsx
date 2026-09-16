// Modal pilih wallet (EIP-6963) — dirender global di _app.js, sehingga bisa
// dipanggil dari halaman mana pun (contoh: landing setelah user pilih peran).
import { useWallet } from "../lib/wallet";

export default function WalletPicker() {
  const { walletProviders, activeProvider, account, busy, connectNow, setPickerOpen } = useWallet();
  return (
    <div className="pickerBackdrop" onClick={() => setPickerOpen(false)}>
      <div className="picker" onClick={(e) => e.stopPropagation()}>
        <h3>Connect wallet</h3>
        <p className="meta">
          Pilih wallet extension untuk konek. {walletProviders.length} wallet terdeteksi (EIP-6963).
        </p>
        {walletProviders.length === 0 && (
          <p className="error" style={{ margin: 0 }}>
            Tidak ada wallet extension terdeteksi. Install MetaMask / Rabby / dll, lalu reload halaman.
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
              {isActive && matches && <em className="pickerActive">aktif</em>}
            </button>
          );
        })}
        {busy === "connect" && <div className="meta" style={{ margin: "8px 0 0" }}>Menghubungkan wallet…</div>}
      </div>
    </div>
  );
}