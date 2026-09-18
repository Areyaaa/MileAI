import "../styles/globals.css";
import { Unbounded } from "next/font/google";
import { WalletProvider, useWallet } from "../lib/wallet";
import WalletPicker from "../components/WalletPicker";

const unbounded = Unbounded({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-unbounded",
});

function GlobalWalletPicker() {
  const { pickerOpen } = useWallet();
  if (!pickerOpen) return null;
  return <WalletPicker />;
}

function App({ Component, pageProps }) {
  return (
    <WalletProvider>
      <div className={unbounded.variable}>
        <Component {...pageProps} />
        <GlobalWalletPicker />
      </div>
    </WalletProvider>
  );
}

export default App;