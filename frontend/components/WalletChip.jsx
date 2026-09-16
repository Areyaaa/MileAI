// Tombol wallet di topbar semua halaman.
//  - Belum connect: klik -> connect (picker bila banyak wallet).
//  - Sudah connect: klik -> menu dropdown: Ganti Wallet / Putuskan Koneksi /
//    pindah network kalau salah chain.
// Picker EIP-6963 dirender GLOBAL di _app.js (components/WalletPicker.jsx).
import { useState } from "react";
import { useWallet } from "../lib/wallet";
import * as chain from "../lib/contract";

export default function WalletChip({ disabled = false }) {
  const { account, onTarget, busy, activeWallet, onConnect, onSwitchNetwork, switchWallet, disconnect } = useWallet();
  const [menu, setMenu] = useState(false);

  const chipIcon = activeWallet && activeWallet.info.icon;

  const handleClick = () => {
    if (busy) return;
    if (!account) {
      if (disabled) return;
      onConnect();
      return;
    }
    setMenu((v) => !v);
  };

  return (
    <div className="walletWrap">
      <button className="walletChip" onClick={handleClick} disabled={disabled && !account}
        title={disabled && !account ? "Pilih peran terlebih dahulu" : account ? (onTarget ? "Buka menu wallet" : "Wallet di chain salah") : "Koneksikan wallet"}>
        {chipIcon ? (
          <img className="chipIcon" src={chipIcon} alt={activeWallet.info.name} />
        ) : (
          <span className={`dot ${account ? (onTarget ? "dot" : "warn") : "off"}`} />
        )}
        {account ? (
          <span className="addr">{account.slice(0, 6)}…{account.slice(-4)}</span>
        ) : (
          "Connect"
        )}
      </button>

      {menu && account && (
        <div className="walletMenu">
          <div className="walletMenuHead">
            <span className="meta">{activeWallet ? activeWallet.info.name : "Wallet"}</span>
            <span className={`badgeChain ${onTarget ? "ok" : "warn"}`}>
              chain {chain.TARGET_CHAIN_ID}
            </span>
          </div>
          {!onTarget && (
            <button className="menuItem warn" onClick={onSwitchNetwork} disabled={Boolean(busy)}>
              Pindah ke chain {chain.TARGET_CHAIN_ID}
            </button>
          )}
          <button className="menuItem" onClick={() => { setMenu(false); switchWallet(); }}>
            Ganti Wallet
          </button>
          <button className="menuItem danger" onClick={() => { setMenu(false); disconnect(); }}>
            Putuskan Koneksi
          </button>
        </div>
      )}
    </div>
  );
}