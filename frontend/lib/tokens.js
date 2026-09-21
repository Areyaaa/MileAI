// Daftar preset token ERC20 untuk dropdown "Token address (ERC20)" di Create
// Escrow. Semua harus 18 decimals — kontrak Mengonversi amount dengan
// ethers.parseEther (frontend/lib/contract.js), token dengan decimals lain
// akan membuat jumlah on-chain salah.
export const KNOWN_TOKENS = [
  { address: "0x93e59e9a997b2D66417A06Bb04a0D8847fD2dcf3", label: "Mile (TestToken)" },
  { address: "0x5c0d9bb86b99168aa8a36fad84d068d258c259a5", label: "tUSDT (TestUSDT)" },
  { address: "0xed24fc36d5ee211ea25a80239fb8c4cfd80f12ee", label: "BUSD (Faucet)" },
];

export const TOKEN_CUSTOM = "__custom__";

export const tokenLabel = (addr) => {
  const found = KNOWN_TOKENS.find((t) => t.address.toLowerCase() === (addr || "").toLowerCase());
  return found ? found.label : null;
};