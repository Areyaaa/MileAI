import "../styles/globals.css";
import { WalletProvider, useWallet } from "../lib/wallet";
import WalletPicker from "../components/WalletPicker";

function GlobalWalletPicker() {
  const { pickerOpen } = useWallet();
  if (!pickerOpen) return null;
  return <WalletPicker />;
}

function App({ Component, pageProps }) {
  return (
    <WalletProvider>
      <Component {...pageProps} />
      <GlobalWalletPicker />
    </WalletProvider>
  );
}

export default App;