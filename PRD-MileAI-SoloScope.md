# PRD: MileAI — Solo-Scope MVP

**Chain:** BNB Smart Chain (BSC Testnet)
**Track:** AI Agents (primary)
**Status:** Solo-dev scope — dipotong dari PRD v2 (versi tim) agar realistis dikerjakan 1 orang

---

## 1. Prinsip Pemangkasan Scope

PRD v2 dirancang untuk 3 orang (smart contract + dashboard + AI service terpisah). Sebagai solo dev, kamu harus **korbankan kecanggihan demi selesai tepat waktu**. Aturan mainnya:

- **Selesai sederhana > canggih tapi setengah jadi.** Juri menilai apa yang benar-benar jalan saat demo, bukan seberapa banyak fitur di PRD.
- **Satu use case yang solid**, bukan banyak use case setengah-setengah.
- Semua fitur "nice to have" masuk ke bagian Roadmap, disebut di pitch sebagai visi, **tidak dikerjakan sekarang**.

## 2. Apa yang TETAP jadi inti produk (jangan dipotong)

Ini yang membedakan MileAI dari escrow biasa — kalau ini hilang, proyeknya kehilangan nilai jualnya:

1. Dana dikunci di smart contract, terbagi per milestone
2. Recipient submit bukti kerja
3. **AI menilai bukti itu dan langsung memicu pencairan dana tanpa approval manusia** (real inti dari track AI Agents)
4. Ada fallback manual kalau AI ragu — supaya tidak terkesan "auto-approve semua"

## 3. Apa yang DIPOTONG dari versi tim

| Fitur di PRD v2 | Keputusan Solo-Scope | Alasan |
|---|---|---|
| Analisis gambar/dokumen (multi-modal) | ❌ Dipotong — ganti bukti kerja berbentuk **teks deskripsi + link** | Multi-modal butuh waktu integrasi & testing yang nggak sepadan untuk 1 orang |
| Penyimpanan bukti di IPFS | ❌ Dipotong — simpan langsung sebagai string/URL di database ringan | Setup IPFS makan waktu, tidak menambah nilai demo |
| Event listener otomatis 24/7 di backend | ✅ **Tetap dipakai — versi ringan (polling)**, bukan event listener penuh | Backend FastAPI polling kontrak tiap beberapa detik lewat background task, bukan WebSocket event subscription yang lebih kompleks — tetap kasih efek "sistem jalan sendiri" tanpa perlu klik manusia |
| Fitur dispute/raiseDispute penuh | ⚠️ Disederhanakan jadi fungsi kontrak saja (tanpa UI khusus) | Tunjukkan ke juri bahwa fungsi ada di kontrak, tapi tidak perlu dashboard terpisah |
| Reputation score, multi proof adapter | ❌ Full dipindah ke Roadmap | Fitur lanjutan, bukan MVP |
| Dashboard dengan banyak halaman/role | ❌ Disederhanakan jadi 1 halaman (single page app) | Cukup untuk demo, hemat waktu dev frontend |
| Status viewer + alasan AI di dashboard | ✅ **Tetap dipakai** — bukan dipotong | Data ini sudah otomatis dihasilkan LLM (confidence score + alasan) saat proses verifikasi, jadi cuma perlu ditampilkan — nggak nambah kerja backend baru |

## 4. User Flow MVP (Solo-Scope)

1. Payer connect wallet → isi form: alamat recipient, jumlah dana, deskripsi kriteria (teks bebas) → klik "Buat Escrow" → dana terkunci di kontrak
2. Recipient connect wallet → lihat daftar escrow miliknya → isi kolom "Bukti Kerja" (teks + link opsional) → klik "Submit Bukti"
3. **Backend FastAPI otomatis mendeteksi bukti baru** lewat polling ke kontrak tiap beberapa detik (background task) → begitu ada `proofText` baru yang statusnya "Submitted", backend langsung kirim deskripsi kriteria + bukti ke LLM → dapat confidence score + alasan → **dashboard menampilkan confidence score & alasan tertulis dari AI secara real-time**, tanpa siapa pun perlu klik apa pun
4. Kalau confidence tinggi → backend otomatis pakai wallet agent untuk panggil `autoRelease()` → dana cair, **status di dashboard berubah otomatis (Pending → Submitted → Released)**
5. Kalau confidence rendah → dashboard tampilkan status "Perlu review manual" beserta alasan AI kenapa belum yakin, payer bisa klik `manualApprove()` sendiri

## 5. Smart Contract — Versi Ringkas

**Kontrak: `MilestoneEscrow.sol`**

```solidity
struct Milestone {
    uint256 amount;
    string  proofRequirement;
    string  proofText;      // bukti kerja: teks + link
    Status  status;         // Pending, Submitted, Released, Disputed
}

struct Escrow {
    address payer;
    address recipient;
    address token;
    Milestone[] milestones;
}
```

**Fungsi (hanya yang esensial):**
| Fungsi | Pemanggil |
|---|---|
| `createEscrow(recipient, token, milestones[])` | Payer |
| `submitProof(escrowId, milestoneIndex, proofText)` | Recipient |
| `autoRelease(escrowId, milestoneIndex)` | AI Agent wallet (role-gated) |
| `manualApprove(escrowId, milestoneIndex)` | Payer |
| `refund(escrowId)` | Payer |

**Keamanan minimal yang tetap wajib** (jangan dipotong — ini yang dinilai juri di kriteria "smart contract quality"):
- `ReentrancyGuard` di fungsi transfer dana
- `AccessControl` — role AI Agent terpisah dari Owner
- Validasi jumlah pencairan tidak melebihi sisa dana milestone
- `SafeERC20` untuk semua transfer token (bukan `IERC20.transfer()` langsung)
- Bounds checking untuk `escrowId`/`milestoneIndex` dari input luar
- Otorisasi spesifik per-escrow (payer A tidak bisa approve/refund escrow milik payer B)
- Idempotency guard berbasis status (cegah `autoRelease`/`submitProof` dipanggil dobel untuk milestone yang sama)
- Batas maksimal jumlah milestone per escrow (cegah gas DoS di `createEscrow`)

> Detail teknis lengkap ada di `AGENTS.md` bagian "Smart Contract — Spesifikasi Wajib" — dokumen ini (PRD) menjelaskan *kenapa* fitur-fitur ini penting untuk penilaian juri, AGENTS.md menjelaskan *bagaimana* implementasinya.

## 6. AI Agent — Versi Ringkas

- **Input:** `proofRequirement` (teks) + `proofText` (teks bukti kerja dari recipient)
- **Proses:** satu kali panggilan ke LLM (text-only, tidak perlu vision) via **Groq API atau Google Gemini API (free tier)** dengan prompt: "Apakah bukti ini memenuhi kriteria berikut? Beri skor 0-100 dan alasan singkat."
- **Trigger:** background task di FastAPI yang polling kontrak tiap beberapa detik (mis. tiap 10-15 detik), cek apakah ada milestone berstatus "Submitted" yang belum diverifikasi — kalau ada, langsung proses otomatis. Ini lebih ringan dibangun dibanding event listener/WebSocket penuh, tapi tetap memberi efek "AI Agent aktif sendiri tanpa intervensi manusia"
- **Eksekusi:** backend FastAPI simpan private key wallet agent (untuk MVP, disimpan di environment variable `.env` — cukup untuk testnet, sebutkan di pitch bahwa versi produksi butuh key management lebih aman), lalu pakai **web3.py** untuk sign & kirim transaksi `autoRelease` ke BSC Testnet

> **Catatan biaya:** backend cukup dijalankan **lokal di laptop kamu** selama development dan saat demo — polling ke kontrak & panggil LLM nggak butuh server yang nyala 24/7 buat keperluan hackathon. Ini menghindari kebutuhan hosting berbayar sama sekali. Kalau nanti mau proyeknya "hidup" terus di luar demo, baru pertimbangkan hosting gratis seperti Render/Railway free tier — tapi itu di luar scope MVP.

> **Catatan risiko (wajib dimitigasi, bukan opsional):** karena `proofText` adalah input bebas dari recipient dan langsung menentukan apakah dana cair otomatis, ada risiko *prompt injection* — recipient bisa mencoba menulis instruksi di dalam bukti kerja untuk memanipulasi skor AI. Prompt ke LLM wajib memisahkan tegas instruksi sistem dari data recipient, dan sistem wajib punya sanity check sederhana (bukti terlalu pendek tapi skor nyaris sempurna → paksa ke review manual). Ini justru poin kuat untuk pitch: menunjukkan tim paham risiko nyata dari "AI yang mengeksekusi transaksi sendiri", bukan cuma demo yang kelihatan jalan.

## 7. Tech Stack Solo-Scope

| Layer | Teknologi | Catatan |
|---|---|---|
| Smart Contract | Solidity + Foundry | Gratis, open-source |
| Backend + AI Agent | Satu service **FastAPI (Python)** sederhana, dijalankan lokal (laptop) saat development & demo | Gabung jadi satu service. Jalankan lokal = gratis total, nggak perlu bayar hosting 24/7 |
| Frontend | Next.js, 1 halaman, jalan lokal (`next dev`) atau deploy gratis di **Vercel free tier** | Vercel free tier cukup buat demo, nggak perlu upgrade |
| Interaksi ke Smart Contract dari backend | **web3.py** | Gratis, open-source |
| RPC BSC Testnet | Public RPC gratis: `https://data-seed-prebsc-1-s1.binance.org:8545` atau `https://bsc-testnet.public.blastapi.io` | Nggak perlu API key/subscription |
| Database bukti kerja | **SQLite** (file lokal, gratis, nggak perlu server) | Skip Postgres/IPFS — SQLite cukup buat MVP demo |
| LLM (AI Agent) | **Groq API** (free tier, cepat & generous limit) atau **Google Gemini API** (free tier) | Hindari model berbayar (GPT-4/Claude API berbayar) — pakai free tier yang masih cukup pintar buat text reasoning sederhana |
| Testnet BNB | Faucet resmi BNB Chain (gratis) | `testnet.bnbchain.org/faucet-smart` |

## 8. Rencana Kerja Solo (7 Hari)

| Hari | Fokus |
|---|---|
| 1 | Setup Foundry, tulis & test `MilestoneEscrow.sol` versi ringkas |
| 2 | Deploy ke BSC Testnet, verifikasi kontrak, siapkan wallet agent |
| 3 | Backend (FastAPI): background task polling kontrak + endpoint panggil LLM + fungsi kirim tx `autoRelease` pakai web3.py & wallet agent |
| 4 | Frontend: form create escrow + submit proof (connect wallet, panggil kontrak) |
| 5 | Frontend: tombol "Verifikasi AI" + **status viewer** (Pending/Submitted/Released) + tampilan confidence score & alasan AI |
| 6 | Integrasi end-to-end, uji alur penuh dari create → submit → auto-release |
| 7 | Buffer: perbaikan bug, siapkan naskah pitch & demo, rekam video cadangan kalau demo live berisiko gagal |

## 9. Roadmap (disebut di pitch, TIDAK dikerjakan sekarang)

- Verifikasi multi-modal (gambar, dokumen, video)
- Penyimpanan bukti di IPFS
- Event listener berbasis WebSocket/subscription penuh (upgrade dari polling, lebih real-time & efisien untuk skala produksi)
- Adapter verifikasi objektif tambahan per industri
- Reputation score recipient
- Key management agent yang lebih aman (MPC/account abstraction)

## 10. Yang Dinilai Juri — Pastikan Ini Kelihatan Saat Demo

- **Smart contract quality:** kontrak ter-deploy, ada test Foundry yang lolos, access control jelas
- **AI Agents (inovasi):** tunjukkan AI benar-benar mengambil keputusan dan mengeksekusi transaksi — bukan cuma kasih saran
- **Real problem solving:** ceritakan masalah bottleneck approval manual di escrow yang ada sekarang
- **Demo yang meyakinkan:** siapkan 1 skenario yang jalan mulus dari awal sampai akhir — lebih baik 1 flow sempurna daripada banyak fitur setengah jadi
