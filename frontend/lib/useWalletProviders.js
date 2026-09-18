// EIP-6963: Multi Injected Provider Discovery
//
// Standard browser mechanism for wallet extensions (MetaMask, Rabby, Coinbase
// Wallet, OKX Wallet, etc.) to announce themselves via events:
//   - consumer dispatches "eip6963:requestProvider"
//   - wallet           -> "eip6963:announceProvider" (detail = {info, provider})
// All wallets already installed announce themselves — no hardcoding needed.
// No extra npm dependency (consistent with AGENTS.md: don't add a large library
// without good reason).
//
// info: { uuid, name, icon (data URI SVG), rdns }
// provider: EIP-1193 object (window.ethereum-compatible)
//
// Fallback: if 0 providers announce via EIP-6963 (old wallets / not extensions),
// use plain window.ethereum if available.
import { useEffect, useState } from "react";

const LEGACY = {
  name: "Wallet browser (legacy)",
  rdns: "window.ethereum",
  icon: null,
};

function legacyInfo() {
  const et = window.ethereum;
  if (et && et.isMetaMask) return { ...LEGACY, name: "MetaMask (legacy)" };
  return LEGACY;
}

export function useWalletProviders() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const found = [];
    const seen = new Set();
    let timer;

    const push = (provider, info) => {
      if (seen.has(info.rdns) || info.rdns === "window.ethereum") return;
      seen.add(info.rdns);
      found.push({ info, provider });
      setProviders([...found]);
    };

    const onAnnounce = (e) => {
      const detail = e.detail;
      if (!detail || !detail.provider || !detail.info) return;
      push(detail.provider, {
        name: detail.info.name || "Wallet",
        rdns: detail.info.rdns || detail.info.uuid,
        icon: detail.info.icon || null,
      });
    };

    window.addEventListener("eip6963:announceProvider", onAnnounce);

    // Ask all installed wallets to announce themselves.
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback window.ethereum for old / non-extension wallets.
    timer = window.setTimeout(() => {
      if (found.length === 0 && window.ethereum) {
        push(window.ethereum, legacyInfo());
      }
    }, 400);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
    };
  }, []);

  return providers;
}