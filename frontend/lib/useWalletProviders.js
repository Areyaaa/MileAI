// EIP-6963: Multi Injected Provider Discovery
//
// Standar browser untuk wallet extension (MetaMask, Rabby, Coinbase Wallet,
// OKX Wallet, dll) meng-announce diri lewat event:
//   - consumer dispatch  "eip6963:requestProvider"
//   - wallet           -> "eip6963:announceProvider" (detail = {info, provider})
// Semua wallet yang SUDAH terinstall mengumumkan diri — tidak perlu hardcode.
// Tanpa dependency npm tambahan (konsisten AGENTS.md: jangan tambah library
// besar tanpa alasan).
//
// info: { uuid, name, icon (data URI SVG), rdns }
// provider: object EIP-1193 (window.ethereum-compatible)
//
// Fallback: kalau 0 provider announce lewat EIP-6963 (wallet lama / bukan
// extension), pakai window.ethereum polos kalau ada.
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

    // Minta semua wallet yang terinstall announce diri.
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    // Fallback window.ethereum untuk wallet lama / non-extension.
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