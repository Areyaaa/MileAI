// Global wallet state (React Context) — used by all pages via useWallet().
//
// Supports:
//  - Multi-wallet via EIP-6963 (MetaMask/Rabby/etc.)
//  - First connect + SWITCH wallet (+ disconnect) at any time
//  - Target network validation (BSC Testnet / anvil), automatic network switch
//  - requireSigner() for txs signed directly by the user's wallet
//
// Use <WalletProvider> once in pages/_app.js.
import { createContext, useContext, useEffect, useState } from "react";
import * as chain from "./contract";
import { useWalletProviders } from "./useWalletProviders";

const WalletContext = createContext(null);

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>.");
  return ctx;
}

export function WalletProvider({ children }) {
  const walletProviders = useWalletProviders();
  const [activeProvider, setActiveProvider] = useState(null);
  const [provider, setProvider] = useState(null); // ethers BrowserProvider
  const [account, setAccount] = useState(null);
  const [onTarget, setOnTarget] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeWallet =
    walletProviders.find((w) => w.provider === activeProvider) || null;

  const pushLog = (msg) => setLogs((l) => [msg, ...l].slice(0, 12));
  const fail = (e) => setError((e && e.message) || String(e));

  const checkChain = async (p) => {
    if (!p) {
      setOnTarget(false);
      return false;
    }
    try {
      const ok = await chain.isTargetChain(p);
      setOnTarget(ok);
      return ok;
    } catch {
      setOnTarget(false);
      return false;
    }
  };

  async function connectNow(walletProvider) {
    if (!walletProvider) return;
    try {
      setError(null);
      setBusy("connect");
      const { provider: p, address } = await chain.connectWallet(walletProvider);
      setActiveProvider(walletProvider);
      setProvider(p);
      setAccount(address);
      await checkChain(p);
      const info = (walletProviders.find((w) => w.provider === walletProvider) || {}).info;
      pushLog(
        `Wallet connected: ${(info && info.name) || "wallet"} · ${address.slice(0, 6)}…${address.slice(-4)}`
      );
    } catch (e) {
      fail(e);
    } finally {
      setBusy("");
    }
  }

  function onConnect() {
    if (busy) return;
    setError(null);
    if (walletProviders.length === 1) return connectNow(walletProviders[0].provider);
    if (walletProviders.length > 1) {
      setPickerOpen(true);
      return;
    }
    fail(
      new Error(
        "No wallet extension detected. Install MetaMask/Rabby/etc., then reload the page."
      )
    );
  }

  async function onSwitchNetwork() {
    try {
      setError(null);
      await chain.ensureBscTestnet(provider);
      await checkChain(provider);
      pushLog(`Network switched to chain ${chain.TARGET_CHAIN_ID}`);
    } catch (e) {
      fail(e);
    }
  }

  async function requireSigner() {
    if (!provider) throw new Error("Connect your wallet first.");
    if (!onTarget) throw new Error("Wallet is not on the target chain — switch networks first.");
    return provider.getSigner();
  }

  function switchWallet() {
    setError(null);
    setPickerOpen(true);
  }

  function disconnect() {
    setProvider(null);
    setAccount(null);
    setActiveProvider(null);
    setOnTarget(false);
    setPickerOpen(false);
    pushLog("Wallet disconnected.");
  }

  // Follow account / network changes on the active wallet.
  // NOTE: EIP-1193 events (accountsChanged/chainChanged) are not ethers v6
  // BrowserProvider events — they must be attached to the raw window.ethereum,
  // not via provider.on(...) (which only accepts block/debug/error).
  useEffect(() => {
    if (!provider) return undefined;
    const ethereum = window.ethereum;
    if (!ethereum) return undefined;
    const onAccounts = async (accounts) => {
      if (!accounts || accounts.length === 0) return;
      const next = accounts[0];
      setAccount(next);
      await checkChain(provider);
      pushLog(`Wallet account changed: ${next.slice(0, 6)}…${next.slice(-4)}`);
    };
    const onChain = async () => {
      await checkChain(provider);
    };
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    return () => {
      ethereum.removeListener("accountsChanged", onAccounts);
      ethereum.removeListener("chainChanged", onChain);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  return (
    <WalletContext.Provider
      value={{
        walletProviders,
        activeProvider,
        activeWallet,
        provider,
        account,
        onTarget,
        busy,
        setBusy,
        error,
        setError,
        logs,
        pushLog,
        pickerOpen,
        setPickerOpen,
        connectNow,
        onConnect,
        onSwitchNetwork,
        requireSigner,
        switchWallet,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}