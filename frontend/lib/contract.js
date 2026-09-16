// Helper interaksi smart contract MilestoneEscrow dari frontend.
//
// Prinsip API design (AGENTS.md): operasi milik user (createEscrow, submitProof,
// manualApprove, refund) di-sign LANGSUNG oleh wallet user (MetaMask) via
// ethers.js — backend tidak pernah menerima private key user.
import { ethers } from "ethers";
import artifact from "./MileAI.json";

export const CONTRACT_ADDRESS =
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";

// Chain target BSC Testnet (default 97). Untuk dev lokal pakai anvil: set
// NEXT_PUBLIC_CHAIN_ID=31337 dan NEXT_PUBLIC_CONTRACT_ADDRESS=alamat deploy anvil.
export const TARGET_CHAIN_ID = parseInt(
  process.env.NEXT_PUBLIC_CHAIN_ID || "97",
  10
);
export const TARGET_CHAIN_HEX = "0x" + TARGET_CHAIN_ID.toString(16);

const ANVIL_RPC = "http://127.0.0.1:8546";
const BSC_TESTNET_RPC =
  "https://data-seed-prebsc-1-s1.binance.org:8545";

export const BSC_TESTNET = {
  chainId: TARGET_CHAIN_HEX,
  chainName: TARGET_CHAIN_ID === 97 ? "BSC Testnet" : "Local Anvil (dev)",
  nativeCurrency: {
    name: TARGET_CHAIN_ID === 97 ? "tBNB" : "ETH",
    symbol: TARGET_CHAIN_ID === 97 ? "tBNB" : "ETH",
    decimals: 18,
  },
  rpcUrls: [
    process.env.NEXT_PUBLIC_TESTNET_RPC ||
      (TARGET_CHAIN_ID === 31337 ? ANVIL_RPC : BSC_TESTNET_RPC),
  ],
  blockExplorerUrls:
    TARGET_CHAIN_ID === 97 ? ["https://testnet.bscscan.com"] : [],
};

export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function symbol() view returns (string)",
];

export const STATUS = {
  0: "Pending",
  1: "Submitted",
  2: "Released",
  3: "Disputed",
};

export const STATUS_SUBMITTED = 1;

export function hasMetaMask() {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(provider) {
  if (!provider) {
    throw new Error("Tidak ada wallet provider terdeteksi.");
  }
  const ethersProvider = new ethers.BrowserProvider(provider, undefined);
  await ethersProvider.send("eth_requestAccounts", []);
  const signer = await ethersProvider.getSigner();
  const address = await signer.getAddress();
  return { provider: ethersProvider, signer, address };
}

function isChainNotFoundError(err) {
  // error 4902 "Unrecognized chain ID" bisa muncul di berbagai lapisan,
  // tergantung wrapper wallet (MetaMask/Rabby/ethers v6):
  // - err.code === 4902                                  (MetaMask langsung)
  // - err.info.error.code === 4902                       (ethers v6 wrap)
  // - err.data.originalError.code === 4902               (Rabby)
  // - err.error.code === -4902 atau nested lain          (beberapa ekstensi)
  // Ambil semua kemungkinan code dari semua path dan bandingkan.
  const codes = [];
  const collect = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (typeof obj.code === "number") codes.push(obj.code);
    for (const key of ["info", "error", "data", "data2"]) {
      if (obj[key]) collect(obj[key]);
    }
  };
  collect(err);
  return codes.includes(4902) || codes.includes(-4902);
}

export async function ensureBscTestnet(provider) {
  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: TARGET_CHAIN_HEX }]);
  } catch (err) {
    if (isChainNotFoundError(err)) {
      await provider.send("wallet_addEthereumChain", [BSC_TESTNET]);
    } else {
      throw err;
    }
  }
}

export async function isTargetChain(provider) {
  const net = await provider.getNetwork();
  return net.chainId === BigInt(TARGET_CHAIN_ID);
}

export function getContract(signerOrProvider) {
  if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "0x0000000000000000000000000000000000000000") {
    throw new Error(
      "NEXT_PUBLIC_CONTRACT_ADDRESS belum diisi di frontend/.env.local"
    );
  }
  return new ethers.Contract(CONTRACT_ADDRESS, artifact.abi, signerOrProvider);
}

// ------------- tx milik user (sign langsung oleh MetaMask) -------------

export async function approveToken(signer, tokenAddress, amountEther) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const tx = await token.approve(CONTRACT_ADDRESS, ethers.parseEther(amountEther));
  return tx.wait();
}

// Approve-infinite (type(uint256).max) — sekali approve, nggak perlu approve
// ulang tiap ganti jumlah milestone. Anjuran umum di UI escrow karena
// payer yang pegang kunci transaksinya sendiri; kontrak tetap nol-kan
// allowance via SafeERC20 tiap escrow created (OpenZeppelin).
export async function approveTokenInfinite(signer, tokenAddress) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const MaxUint256 = ethers.MaxUint256;
  const tx = await token.approve(CONTRACT_ADDRESS, MaxUint256);
  return tx.wait();
}

export async function createEscrow(signer, recipient, tokenAddress, milestones) {
  const contract = getContract(signer);
  const list = milestones.map((m) => ({
    amount: ethers.parseEther(m.amount),
    proofRequirement: m.requirement,
    proofText: "",
    status: 0,
  }));
  const tx = await contract.createEscrow(recipient, tokenAddress, list);
  const receipt = await tx.wait();
  let escrowId = null;
  try {
    const iface = new ethers.Interface(artifact.abi);
    for (const log of receipt.logs || []) {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "EscrowCreated") {
        escrowId = Number(parsed.args.escrowId);
      }
    }
  } catch {
    /* event tidak ter-parse (mis. provider lama) — escrowId diambil dari count */
  }
  return { receipt, escrowId };
}

export async function submitProof(signer, escrowId, milestoneIndex, proofText) {
  const contract = getContract(signer);
  const tx = await contract.submitProof(escrowId, milestoneIndex, proofText);
  return tx.wait();
}

export async function manualApprove(signer, escrowId, milestoneIndex) {
  const contract = getContract(signer);
  const tx = await contract.manualApprove(escrowId, milestoneIndex);
  return tx.wait();
}

export async function refundEscrow(signer, escrowId) {
  const contract = getContract(signer);
  const tx = await contract.refund(escrowId);
  return tx.wait();
}

// ------------- baca on-chain (read-only, tanpa gas) -------------

export async function readEscrowOnchain(provider, escrowId) {
  const contract = getContract(provider);
  const [payer, recipient, token, milestoneCount, refunded] =
    await contract.getEscrow(escrowId);
  const milestones = [];
  for (let i = 0; i < Number(milestoneCount); i++) {
    const [amount, proofRequirement, proofText, status] =
      await contract.getMilestone(escrowId, i);
    milestones.push({
      index: i,
      amount: amount,
      amountEther: ethers.formatEther(amount),
      proofRequirement,
      proofText,
      status: Number(status),
    });
  }
  return { payer, recipient, token, milestoneCount: Number(milestoneCount), refunded, milestones };
}

export async function readTokenSymbol(provider, tokenAddress) {
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await token.symbol();
  } catch {
    return null;
  }
}

// Jumlah escrow yang pernah dibuat (untuk ringkasan dashboard).
export async function readEscrowCount(provider) {
  const contract = getContract(provider);
  return Number(await contract.escrowCount());
}