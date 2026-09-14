# AGENTS.md — MileAI

## Project Overview

MileAI adalah protokol escrow milestone-based di **BNB Smart Chain (BSC Testnet)** di mana **AI Agent** memverifikasi bukti kerja secara otonom dan otomatis mencairkan dana — tanpa approval manusia — begitu confidence score-nya cukup tinggi. Ini dibangun untuk hackathon BNB Chain, track **AI Agents**, oleh **1 developer solo**.

Spesifikasi lengkap ada di `PRD-MileAI-SoloScope.md` di root repo — baca file itu dulu sebelum mulai coding apa pun. Dokumen ini (AGENTS.md) cuma panduan teknis buat AI coding agent, bukan pengganti PRD.

## Prinsip Kerja (WAJIB dipatuhi)

- **Solo-scope, bukan versi tim.** Jangan tambah fitur di luar yang disebut PRD solo-scope, meskipun "kelihatan bagus" — kalau ragu, tanya dulu sebelum implementasi.
- **100% free-tier resources.** Jangan pernah pakai layanan berbayar (no paid API tier, no paid hosting, no paid RPC). Kalau butuh LLM, pakai Groq API atau Google Gemini API (free tier). Kalau butuh RPC, pakai public RPC BSC Testnet gratis.
- **Selesai sederhana > canggih tapi setengah jadi.** Prioritaskan 1 flow end-to-end yang benar-benar jalan, di atas banyak fitur yang belum lengkap.
- **Jangan install dependency besar tanpa alasan jelas.** Tanya dulu kalau mau nambah library baru yang nggak disebut di stack.

## Tech Stack

| Layer | Teknologi |
|---|---|
| Smart Contract | Solidity + Foundry |
| Chain | BSC Testnet |
| Backend + AI Agent | FastAPI (Python), single service |
| Interaksi ke Smart Contract | web3.py |
| Database | SQLite (file lokal) |
| LLM | Groq API atau Google Gemini API (free tier), text-only — bukan multi-modal |
| Frontend | Next.js, single page |
| Wallet | MetaMask (BSC Testnet) |

## Struktur Proyek (target)

```
mileai/
├── contracts/
│   ├── src/MilestoneEscrow.sol
│   ├── test/MilestoneEscrow.t.sol
│   └── foundry.toml
├── backend/
│   ├── main.py              # FastAPI app
│   ├── agent.py             # background task polling + LLM call + autoRelease
│   ├── contract_client.py   # web3.py wrapper: read/write ke kontrak
│   ├── db.py                 # SQLite setup
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── (Next.js app, single page)
├── PRD-MileAI-SoloScope.md
└── AGENTS.md
```

## Smart Contract — Spesifikasi Wajib

Kontrak: `MilestoneEscrow.sol`

**Fungsi wajib ada** (jangan kurang, jangan lebih dari solo-scope):
- `createEscrow(recipient, token, milestones[])` — payer
- `submitProof(escrowId, milestoneIndex, proofText)` — recipient
- `autoRelease(escrowId, milestoneIndex)` — hanya bisa dipanggil wallet dengan role `AI_AGENT_ROLE`
- `manualApprove(escrowId, milestoneIndex)` — payer, fallback kalau AI confidence rendah
- `refund(escrowId)` — payer

**Keamanan wajib** (ini yang dinilai juri di kriteria "smart contract quality" — jangan skip):
- `ReentrancyGuard` (OpenZeppelin) di semua fungsi yang transfer dana
- `AccessControl` (OpenZeppelin) — role `AI_AGENT_ROLE` terpisah dari `Ownable`/admin role
- Checks-effects-interactions pattern: update status milestone SEBELUM transfer dana
- Validasi: jumlah yang dicairkan `autoRelease`/`manualApprove` tidak boleh melebihi sisa dana milestone tersebut
- Emit event di setiap perubahan status penting: `EscrowCreated`, `ProofSubmitted`, `MilestoneReleased`, `EscrowRefunded`
- **Gunakan `SafeERC20` (OpenZeppelin)** untuk semua transfer token, bukan `IERC20.transfer()` langsung — banyak token tidak mengikuti standar return `bool` dengan benar dan bisa silent-fail
- **Bounds checking wajib** di setiap fungsi yang menerima `escrowId`/`milestoneIndex` dari luar — pastikan index ada dalam range array sebelum diakses, jangan andalkan revert bawaan Solidity saja
- **Otorisasi harus spesifik per-escrow**, bukan pengecekan role umum — `manualApprove(escrowId, ...)` dan `refund(escrowId)` wajib cek `msg.sender == escrow[escrowId].payer` untuk escrow ID tersebut, supaya payer A tidak bisa approve/refund escrow milik payer B
- **Idempotency guard di level status**: `submitProof` hanya boleh jalan kalau status milestone saat ini `Pending`; `autoRelease`/`manualApprove` hanya boleh jalan kalau status saat ini `Submitted`. Ini mencegah eksekusi dobel kalau backend memanggil fungsi yang sama dua kali (misal race condition antar siklus polling)
- **Batasi jumlah milestone per escrow** (misal maksimal 10) di `createEscrow` — array yang terlalu panjang bisa bikin transaksi exceed block gas limit (DoS)

**Test wajib** (Foundry, `forge test`):
- Skenario sukses: create → submit proof → autoRelease oleh agent role → dana diterima recipient
- Skenario gagal: alamat tanpa `AI_AGENT_ROLE` mencoba panggil `autoRelease` → harus revert
- Skenario reentrancy: pastikan guard bekerja
- Skenario refund: payer bisa tarik balik dana yang belum dicairkan

## Backend — Spesifikasi Wajib

**`agent.py` — background task polling:**
- Polling kontrak tiap 10–15 detik (bukan WebSocket/event subscription — itu di luar scope)
- Cek status milestone yang "Submitted" tapi belum diverifikasi
- Kalau ketemu: kirim `proofRequirement` + `proofText` ke LLM (Groq/Gemini, text-only) dengan prompt yang minta confidence score (0-100) + alasan singkat
- Confidence >= 85 -> panggil `autoRelease()` via web3.py pakai wallet agent
- Confidence 50-84 -> simpan status "perlu review manual" + alasan, JANGAN eksekusi apa pun
- Confidence < 50 -> simpan status "bukti belum cukup" + alasan

**Keamanan wajib di agent.py (jangan skip — ini titik paling kritis karena langsung memicu transfer dana):**
- **Prompt injection defense**: `proofText` adalah input bebas dari recipient dan masuk ke prompt LLM yang menentukan pencairan dana. Prompt ke LLM WAJIB memisahkan tegas antara instruksi sistem dan data recipient (pakai delimiter eksplisit), dan secara eksplisit menyuruh LLM mengabaikan instruksi apa pun yang muncul di dalam `proofText`/`proofRequirement`, memperlakukannya murni sebagai data yang dievaluasi
- **Sanity guard terhadap output LLM**: kalau confidence sangat tinggi (misal >=98) tapi `proofText` sangat pendek/tidak proporsional, paksa turunkan ke status "perlu review manual" — pola ini konsisten dengan percobaan prompt injection sederhana
- **Idempotency sebelum eksekusi**: sebelum memanggil `autoRelease()`, cek ulang status milestone on-chain TERKINI (bukan cuma cache di SQLite) — kalau statusnya sudah bukan "Submitted" lagi, batalkan, jangan kirim transaksi
- **web3.py bersifat sync** — panggilan ke kontrak (read maupun write) di background task WAJIB dijalankan lewat `run_in_executor`/thread terpisah, supaya tidak memblokir event loop FastAPI yang melayani endpoint lain
- **Nonce management**: kalau ada beberapa milestone yang siap di-release dalam satu siklus polling, urus nonce transaksi wallet agent secara eksplisit (lock/queue) supaya tidak tabrakan

**Environment variables (`.env`):**
```
AGENT_PRIVATE_KEY=
BSC_TESTNET_RPC=https://data-seed-prebsc-1-s1.binance.org:8545
CONTRACT_ADDRESS=
LLM_API_KEY=
LLM_PROVIDER=groq   # atau "gemini"
```
Jangan pernah hardcode private key atau API key di kode — selalu baca dari `.env`. Jangan commit `.env` — pastikan ada di `.gitignore`.

**Prinsip API design (wajib dipatuhi):**
- Backend **tidak pernah** menerima atau menyimpan private key milik payer/recipient. Fungsi yang mengubah state milik user (`createEscrow`, `submitProof`, `manualApprove`, `refund`) di-sign LANGSUNG oleh wallet user dari frontend (ethers.js + MetaMask) ke smart contract — bukan lewat backend sebagai relay
- Backend hanya memegang satu private key: wallet AI Agent (`AGENT_PRIVATE_KEY`), khusus dipakai untuk memanggil `autoRelease()`
- Endpoint FastAPI yang dibutuhkan minimal: `GET /health`, `GET /escrows/{id}/milestones/{index}/status` (dibaca status viewer di frontend, gabungkan data on-chain + hasil verifikasi AI dari SQLite), dan `POST /agent/trigger/{escrow_id}/{milestone_index}` (opsional, buat testing manual tanpa menunggu siklus polling)

## Frontend — Spesifikasi Wajib

Single page, berisi:
1. Connect wallet (MetaMask, BSC Testnet)
2. Form "Buat Escrow" — alamat recipient, jumlah, daftar milestone (jumlah + deskripsi kriteria teks bebas)
3. Form "Submit Bukti" — pilih escrow & milestone, isi teks bukti kerja + link opsional
4. Status viewer — tampilkan tiap milestone: status (Pending/Submitted/Released/Perlu Review), confidence score AI, alasan tertulis AI
5. Tombol "Approve Manual" — muncul kalau status "perlu review manual"

Jangan bikin multi-halaman/routing kompleks — semua di satu halaman.

## Batasan Keras (Do NOT)

- Jangan implementasi verifikasi multi-modal (gambar/dokumen) — bukti kerja hanya teks + link
- Jangan pakai IPFS — simpan proofText langsung on-chain atau di SQLite
- Jangan pakai WebSocket/event subscription — polling sederhana saja
- Jangan pakai LLM API berbayar (GPT-4, Claude API berbayar, dst) — hanya free tier
- Jangan pakai hosting berbayar — backend jalan lokal, frontend boleh Vercel free tier
- Jangan tambah fitur reputation score, dispute UI, atau adapter verifikasi tambahan — itu di roadmap, bukan MVP

## Setup & Run Commands (isi setelah scaffolding jadi)

```bash
# Contracts
cd contracts && forge install && forge test

# Backend
cd backend && pip install -r requirements.txt --break-system-packages
uvicorn main:app --reload

# Frontend
cd frontend && npm install && npm run dev
```

## Dokumentasi Wajib Setiap Selesai Membangun

Setiap kali kamu selesai membuat, mengubah, atau memperbaiki kode di salah satu area berikut, **update file laporan yang sesuai sebelum menganggap task selesai** — jangan tunggu diminta:

| Area yang dikerjakan | File laporan wajib diupdate |
|---|---|
| Smart contract (`contracts/**`) | `docs/contracts.md` |
| Backend / AI Agent (`backend/**`) | `docs/backend.md` |
| Frontend (`frontend/**`) | `docs/frontend.md` |

Kalau satu task menyentuh lebih dari satu area, update semua file laporan yang relevan.

**Format tiap entri** (log kronologis, entri baru di paling atas file):

```markdown
## [YYYY-MM-DD HH:MM] <judul singkat perubahan>

**Apa yang dibuat/diubah:**
- (poin ringkas, file/fungsi yang disentuh)

**Kenapa:**
- (alasan desain, terutama kalau ada trade-off atau penyimpangan dari PRD/AGENTS.md)

**Status:**
- [ ] Belum ditest / [x] Sudah ditest — sebutkan caranya

**Hal yang perlu diperhatikan / belum selesai:**
- (technical debt, TODO, edge case — atau "Tidak ada")
```

Kalau file `docs/contracts.md`, `docs/backend.md`, atau `docs/frontend.md` belum ada, buat dulu dengan heading judul + `## Log Perubahan` sebelum menambah entri pertama. Perubahan trivial (format ulang, rename variabel lokal, fix typo komentar) tidak perlu dilaporkan — tapi kalau ragu, defaultnya laporkan.

## Kalau Ragu

Kalau instruksi di PRD dan AGENTS.md ini ambigu atau ada keputusan desain yang belum jelas, tanya dulu sebelum implementasi — jangan asumsi sendiri, apalagi untuk bagian smart contract yang berkaitan langsung dengan keamanan dana.
