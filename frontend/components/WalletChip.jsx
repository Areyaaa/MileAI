// Wallet button in the topbar of every page.
//  - Not connected: click -> connect (picker when multiple wallets).
//  - Connected: click -> dropdown menu: Switch Wallet / Disconnect /
//    switch network if on the wrong chain.
// EIP-6963 picker rendered GLOBALLY in _app.js (components/WalletPicker.jsx).
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
        title={disabled && !account ? "Pick a role first" : account ? (onTarget ? "Open wallet menu" : "Wallet on wrong chain") : "Connect wallet"}>
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
              Switch to chain {chain.TARGET_CHAIN_ID}
            </button>
          )}
          <button className="menuItem" onClick={() => { setMenu(false); switchWallet(); }}>
            Switch Wallet
          </button>
          <button className="menuItem danger" onClick={() => { setMenu(false); disconnect(); }}>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}