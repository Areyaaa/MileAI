# Laporan Teknis — Smart Contract (MilestoneEscrow)

## Log Perubahan

## [2026-09-16 20:30] Pre-testnet security review: tidak ada perubahan kode kontrak

**Apa yang diperiksa/difirmasi:**
- Review keamanan penuh sebelum deploy testnet. Tidak ada perubahan kode kontrak (`MilestoneEscrow.sol`). Semua mekanisme keamanan yang diwajibkan sudah berjalan benar (verified via test suite 41 test):
  - `ReentrancyGuard` berfungsi (test `MaliciousToken` re-enter → gagal).
  - `AccessControl` (`AI_AGENT_ROLE` terpisah dari `DEFAULT_ADMIN_ROLE`).
  - `SafeERC20` menangkap silent-fail (`FalseTransferERC20` test → revert `SafeERC20FailedOperation`).
  - Checks-effects-interactions: status milestone di-set sebelum transfer dana.
  - Bounds checking: `_escrowsAt`, `_milestoneAt` dengan custom error.
  - Otorisasi per-escrow: `manualApprove` dan `refund` cek `msg.sender == e.payer`.
  - Idempotency via status guard: Submit/Release hanya jalan di status yang sesuai.
  - `MAX_MILESTONES=10`.

**Kenapa:**
- Juri BNB Chain hackathon menilai smart contract quality. Review ini memastikan tidak ada vulnerability yang terlewat sebelum dana asli/testnet mengalir.

**Status:**
- [x] Sudah ditest — 41/41 PASS, fuzz 10k PASS, coverage 100%.

**Hal yang perlu diperhatikan / belum selesai (known limitation, bukan bug):**
- **Fee-on-transfer token**: kalau payer memakai token dengan mekanisme fee-on-transfer, jumlah yang benar-benar masuk ke kontrak bisa kurang dari `sum(milestone.amount)`. Saat `autoRelease`/`manualApprove` dipanggil, `safeTransfer` mencoba mengirim jumlah `milestone.amount` — kalau kontrak tidak punya cukup token (karena fee sudah mengurangi balance), transaksi revert (status tidak berubah). Ini bukan vulnerability, tapi berarti token fee-on-transfer tidak kompatibel. Token standar (USDT, USDC, BNB, MILE, dll.) tidak ada fee-on-transfer, jadi tidak berpengaruh di testnet atau mainnet. Tidak perlu fix untuk MVP.
- **`raiseDispute`/`resolveDispute`** tidak pakai `nonReentrant` — aman karena tidak ada transfer dana, tapi catatan di sini untuk referensi.

## [2026-09-14 20:10] Gap test: SafeERC20 false-return, fuzz 10k runs, revoke role, + script deploy & E2E

**Apa yang dibuat/diubah:**
- `contracts/test/MilestoneEscrow.t.sol`: 35 -> **41 test, semua PASS** (0 failed).
  - 2 mock token ERC20 non-standar baru: `FalseTransferERC20` (override `transfer()` return `false`) dan `FalseTransferFromERC20` (override `transferFrom()` return `false`) — mensimulasikan token yang silent-fail alih-alih revert, alasan utama pemakaian `SafeERC20`.
  - 4 test baru membuktikan `SafeERC20` benar-benar revert (`SafeERC20FailedOperation(token)`), bukan silent-fail:
    `test_CreateEscrowRevertsOnFalseTransferFrom` (safeTransferFrom saat create), plus `test_AutoReleaseRevertsOnFalseTransfer` / `test_ManualApproveRevertsOnFalseTransfer` / `test_RefundRevertsOnFalseTransfer` (safeTransfer saat release/refund). Di cess test di-assert state tidak berubah (dana tetap terkunci, status tetap, tidak ada partial effect).
  - 2 test rotasi wallet agent: `test_RevokedAgentCannotAutoRelease` (admin revoke `AI_AGENT_ROLE` → agent tidak bisa autoRelease; rotasi ke agent baru berhasil) dan `test_RevokedAgentCannotReleaseOtherSubmittedMilestone` (revoke di tengah jalan membekukan milestone lain yang masih `Submitted`).
- `contracts/src/TestToken.sol` (baru): mintable ERC20 untuk keperluan E2E testnet. Bukan token produksi.
- `contracts/script/Deploy.s.sol` (baru): forge script deploy `TestToken` + `MilestoneEscrow`, grant `AI_AGENT_ROLE` ke `AGENT_PRIVATE_KEY`. Key dibaca dari `.env`.
- `contracts/script/E2E.s.sol` (baru): forge script jalankan 1 flow end-to-end di chain mana pun: createEscrow (payer) → submitProof (recipient) → autoRelease (agent), lalu verifikasi state on-chain.
- `contracts/.env.example` (baru) + `.gitignore` ditambah `contracts/.env` & `contracts/broadcast/`.

**Hasil:**
- `forge test` via WSL: **41 passed, 0 failed**.
- Invariant paling kritis "total token terkunci == sum semua milestone amount" diuji ulang dengan **`--fuzz-runs 10000`**: **PASS (10.000 runs, 0 failed)**.
- `forge coverage --report summary`: `src/MilestoneEscrow.sol` tetap **100% lines / statements / branches (26/26) / funcs**.
- Validasi script deploy + E2E di **Anvil lokal** (bukan testnet) sukses: deploy `TestToken` 0x5FbDB2…0aa3, `MilestoneEscrow` 0xe7f1725…F0512; E2E create→submit→autoRelease berjalan penuh (escrowId 0, milestone status Released=2, recipient balance 100 MILE, escrow balance 0).

**Kenapa:**
- Skenario token return-`false` adalah alasan awal penggantian ke `SafeERC20`; user meminta cross-check eksplisit bahwa `SafeERC20` benar-benar revert, bukan hanya dianggap aman dari test reentrancy. Di OZ v5, perilaku ini revert dengan `SafeERC20FailedOperation(address token)` — di-assert selector-nya di test.
- Test revoke menutup celah rotasi wallet agent yang tidak pernah di-cover (selama ini role hanya di-grant sekali di setUp).
- Deploy & E2E dibuat sebagai forge script (bukan `cast` manual) supaya bisa dipakai berulang dan tx hash tercatat otomatis di `broadcast/<script>/<chainid>/run-latest.json`. Script E2E memakai key berbeda per peran (payer/recipient/agent) via `vm.startBroadcast(key)` per tahap — merepresentasikan peran on-chain yang sebenarnya.
- Rotasi/switch signer E2E dipisah per helper function karena `vm.startBroadcast` harus sekuensial antar peran (ditemukan saat penyusunan; tidak ada konflik dengan gotcha `vm.prank`).

**Status:**
- [x] Sudah ditest — 41/41 PASS, fuzz 10k PASS, coverage kontrak 100%, deploy+E2E tervalidasi di Anvil lokal.
- [ ] **Belum testnet beneran** — script deploy & E2E sudah siap dan tervalidasi lokal, tapi deploy ke BSC Testnet **ditunda atas keputusan user** (menunggu wallet testnet terisi BNB faucet).

**Hal yang perlu diperhatikan / belum selesai:**
- Untuk menjalankan Task 4 ke BSC Testnet belakangan: (1) isi `contracts/.env` (DEPLOYER/PAYER/RECIPIENT/AGENT_PRIVATE_KEY — boleh satu wallet uji), (2) wallet punya BNB testnet (https://testnet.bnbchain.org/faucet-smart), (3) `forge script script/Deploy.s.sol:Deploy --rpc-url $RPC_URL --broadcast`, set CONTRACT_ADDRESS/TOKEN_ADDRESS, lalu `forge script script/E2E.s.sol:E2E --rpc-url $RPC_URL --broadcast`. Catat alamat kontrak + tx hash tiap langkah.
- Catatan: `contracts/.env` terakhir dipakai untuk uji lokal Anvil (bukan key produksi) dan sudah ter-gitignore — wajib diisi ulang dengan key testnet asli sebelum deploy beneran.
- Catatan fuzz: 10k runs melewati invariant; untuk eksplorasi adversarial lebih dalam (jeda hingga ribuan/jutaan runs) tetap direkomendasikan Echidna/medusa di iterasi lanjutan.

## [2026-09-14 16:18] Perdalam test suite: fuzz, reentrancy eksplisit, edge case refund, coverage & gas

**Apa yang dibuat/diubah:**
- `contracts/test/MilestoneEscrow.t.sol` ditulis ulang/diperluas — 35 test (semula 24), semua PASS. Tidak ada perubahan pada `MilestoneEscrow.sol` (tidak ditemukan bug nyata).
- 3 test fuzz (256 runs masing-masing, pakai `vm.assume`):
  - `testFuzz_CreateEscrowTransfersTotal(uint8 count, uint64[10] amounts)` — jumlah milestone acak 1..MAX (10) & amount acak >0; asersi total yang dikunci == sum semua amount, balance payer berkurang total, milestoneCount & amount per-index cocok.
  - `testFuzz_AutoReleaseInvalidInputsAlwaysRevert(uint256,uint256)` — semua input (escrowId, milestoneIndex) selain (0,0) HARUS revert (EscrowNotFound / MilestoneOutOfRange / InvalidStatus), dan memastikan tidak ada efek parsial (dana escrow utuh, recipient 0, status tetap Submitted).
  - `testFuzz_ManualApproveInvalidInputsAlwaysRevert(uint256,uint256)` — sama untuk `manualApprove` dari `payer`.
- Reentrancy eksplisit: mock token jahat di-rename dari `ReentrantERC20` jadi `MaliciousToken` yang menerima payload arbitrary (`setup(escrow, bytes)`) sehingga hook `transfer` bisa mencoba re-enter **autoRelease, manualApprove, maupun refund** satu per satu:
  - `test_ReentrancyBlocksAutoRelease` / `test_ReentrancyBlocksManualApprove` / `test_ReentrancyBlocksRefund` — semua diverifikasi: `reenterSucceeded == false`, dana dicairkan/dikembalikan **tepat satu kali**, tidak ada double-spend.
- Edge case #5 (atas keputusan user, kontrak tetap `revert NothingToRefund`, bukan return-0):
  - `test_RefundAllReleasedRevertsWithoutDoubleSpend` — escrow yang seluruh milestone-nya `Released` lalu `refund()`: revert `NothingToRefund`, balance payer/recipient/escrow tidak berubah, `refunded` tetap false (bukan double-spend, bukan refund 0).
- Test tambahan untuk naikkan branch coverage: `NoMilestones`, `EmptyRequirement`, `manualApprove` saat Pending, `autoRelease` setelah refund, `raiseDispute`/`resolveDispute` setelah refund, `createEscrow` dengan 10 milestone (sekaligus data gas max).

**Hasil:**
- `forge test` (lewat WSL): **35 passed, 0 failed** — termasuk 3 test fuzz @256 runs.
- `forge coverage --report summary`: `src/MilestoneEscrow.sol` **100%** lines (100/100), statements (133/133), **branches (26/26)**, funcs (12/12); total 100% (115/115, 146/146, 27/27, 18/18). Fungsi transfer dana (`autoRelease`, `manualApprove`, `refund`) penuh branch ter-cover.
- `forge test --gas-report` (fungsi paling boros):
  - `createEscrow`: min 27.965 / avg 295.055 / **max 703.293** gas — paling boros, dominasi dari copy struct 10 milestone + `safeTransferFrom` (kasus max = 10 milestone, 1 ether per milestone).
  - `refund`: avg 60.678 / max 105.729. `autoRelease`: avg 33.121 / max 110.455. `manualApprove`: avg 29.913 / max 110.343.
  - Deployment size **6.973 bytes** (di bawah batas EIP-170 24.576 bytes).

**Kenapa:**
- `MaliciousToken` memakai payload arbitrary (`abi.encodeWithSelector`) supaya satu kontrak bisa menguji reentrancy ke 3 fungsi berbeda — bukan 3 token terpisah.
- Fuzz `autoRelease`/`manualApprove` memakai `vm.expectRevert()` general (bukan selector spesifik) karena kombinasi input acak bisa revert dengan error berbeda (bounds vs status).
- Batasan fuzz yang ditemukan & dihindari: `vm.prank` termakan staticcall di dalam evaluasi argumen (mis. `escrow.MAX_MILESTONES()` pada helper `_ten()`), sehingga `createEscrow` sempat dijalankan oleh test-contract (memicu `ERC20InsufficientAllowance`). Diperbaiki dengan menghitung array sebelum `vm.prank`.

**Status:**
- [x] Sudah ditest — `forge test`, `forge coverage --report summary`, `forge test --gas-report` (semua via WSL `/home/user/.foundry/bin/forge`).

**Hal yang perlu diperhatikan / belum selesai:**
- Keputusan refund all-Released dipertahankan = `revert NothingToRefund` (bukan return-0) sesuai konfirmasi user; edge case di-cover `test_RefundAllReleasedRevertsWithoutDoubleSpend`.
- Deploy testnet tetap ditunda (instruksi user). Tidak ada perubahan logika kontrak pada iterasi ini.

## [2026-09-14 15:40] Tambah fungsi resolveDispute (Disputed -> Pending)

**Apa yang dibuat/diubah:**
- `contracts/src/MilestoneEscrow.sol` — tambah fungsi `resolveDispute(escrowId, milestoneIndex)` dan event `DisputeResolved`.
- `contracts/test/MilestoneEscrow.t.sol` — 2 test baru (total 24, semua PASS):
  - `test_ResolveDisputeBackToPendingThenResubmit` — dispute → resolve → Pending → resubmit → autoRelease → dana cair.
  - `test_ResolveDisputeOnlyPartiesAndOnDisputed` — hanya payer/recipient escrow tsb (`NotAuthorized` untuk orang lain), dan hanya valid dari status `Disputed` (`InvalidStatus`).

**Kenapa:**
- Atas keputusan user: milestone `Disputed` tidak boleh jalan buntu — `resolveDispute` mengembalikannya ke `Pending` sehingga recipient bisa submit bukti ulang. Dipilih perilaku "resolve → Pending" (bukan langsung cair) supaya tidak ada pihak yang bisa "menang sendiri" dalam sengketa; dana tetap aman sampai bukti baru diverifikasi.
- Keamanan dijaga konsisten dengan fungsi lain: bounds checking, otorisasi per-escrow (payer/recipient escrow tsb), guard `AlreadyRefunded`, idempotency status (`resolveDispute` hanya dari `Disputed`, `submitProof` hanya dari `Pending`).

**Status:**
- [x] Sudah ditest — `forge test` via WSL: **24 passed, 0 failed**.

**Hal yang perlu diperhatikan / belum selesai:**
- Status `Disputed` & `resolveDispute` belum punya UI khusus — sesuai keputusan user, frontend hanya menampilkan status Disputed di status viewer (tanpa tombol/flow khusus; batasan keras AGENTS.md melarang dispute UI).
- Belum deploy ke BSC Testnet (sengaja ditunda sesuai instruksi user — menunggu flow end-to-end siap).

## [2026-09-14 15:27] Hari 1 — Setup Foundry + implementasi MilestoneEscrow.sol lengkap

**Apa yang dibuat/diubah:**
- `contracts/foundry.toml` — profile default (src/out/libs/test), `solc_version 0.8.23`, `evm_version london` (kompatibel BSC), RPC endpoint `bsc_testnet` public BSC Testnet.
- `contracts/remappings.txt` — hasil `forge remappings` (OZ `@openzeppelin/contracts`, forge-std).
- Dependency via `forge install`: `OpenZeppelin/openzeppelin-contracts@v5.0.2`, `foundry-rs/forge-std@v1.16.2`.
- `contracts/src/MilestoneEscrow.sol` — kontrak escrow milestone-based + AI_AGENT role.
- `contracts/test/MilestoneEscrow.t.sol` — 22 test Foundry, semua PASS.

**Fungsi kontrak & keamanan yang dipenuhi (cek ulang dari AGENTS.md):**
- `createEscrow` ✅ `submitProof` ✅ `autoRelease` ✅ `manualApprove` ✅ `refund` ✅ (+ `raiseDispute` atas persetujuan user, dari PRD bagian 3).
- `ReentrancyGuard` di semua fungsi yang memindahkan dana (`createEscrow`, `submitProof`, `autoRelease`, `manualApprove`, `refund`). `access/AccessControl.sol` per OZ.
- `SafeERC20` (`.safeTransfer` / `.safeTransferFrom`) di semua transfer token — bukan `IERC20.transfer` langsung.
- Bounds checking eksplisit (`_escrowsAt` untuk `escrowId`, `_milestoneAt` untuk `milestoneIndex`) di seluruh fungsi input luar, memakai custom error `EscrowNotFound` / `MilestoneOutOfRange`.
- Otorisasi per-escrow: `manualApprove` & `refund` cek `msg.sender == payer` escrow tsb (test `test_ManualApproveOnlyPayerOfThatEscrow`, `test_RefundOnlyPayerOfThatEscrow`).
- Idempotency guard level status: `submitProof` hanya dari `Pending`; `autoRelease`/`manualApprove` hanya dari `Submitted`; `refund` hanya sekali (`AlreadyRefunded`). (test `test_SubmitProofCannotRunTwice`, `test_AutoReleaseReturnsToReleaseReverts`, `test_NoOperationsAfterRefund`).
- Batas max 10 milestone di `createEscrow` (`TooManyMilestones`).
- Checks-effects-interactions: status diubah sebelum transfer dana.
- Validasi tambahan: amount milestone > 0, `proofRequirement` tidak kosong, `proofText` tidak kosong, alamat non-zero.
- Events di setiap status penting: `EscrowCreated`, `ProofSubmitted`, `MilestoneReleased`, `EscrowRefunded`, `MilestoneDisputed`.
- Read getters untuk integrasi backend/frontend: `getEscrow`, `getMilestone`, `escrowCount`.

**Kenapa:**
- OZ v5.0.2 tidak lagi auto-grant `DEFAULT_ADMIN_ROLE` di constructor, jadi constructor `_grantRole(DEFAULT_ADMIN_ROLE, msg.sender)` ditambahkan eksplisit (deployer = admin; admin men-grant `AI_AGENT_ROLE` ke wallet agent setelah deploy).
- `evm_version london` dipilih agar transaksi tidak memakai `PUSH0` (kebutuhan prainstall BSC ama deploy), sedang test lokal anvil tetap aman.
- Keputusan desain atas persetujuan user sebelum implementasi: (1) `refund` berlaku "kapan pun, cairkan sisa dana" (semua milestone yang belum `Released`); (2) status `Disputed` + fungsi `raiseDispute()` ikut diimplementasi (fungsi kontrak saja, tanpa UI), payable hanya payer/recipient escrow tsb dan hanya dari status `Submitted`.
- `proofText` disimpan on-chain (sesuai batasan keras PRD: bukti teks + link, tanpa IPFS).

**Status:**
- [x] Sudah ditest — `forge test` lewat WSL (`/home/user/.foundry/bin/forge test -v`): **22 passed, 0 failed**. Contoh skenario wajib yang lolos: alur sukses create→submit→autoRelease (`test_FlowCreateSubmitAutoRelease`), non-agent gagal `autoRelease` (`test_NonAgentCannotAutoRelease`), reentrancy diblokir (`test_ReentrancyGuardBlocksReentry` menggunakan `ReentrantERC20` token yang coba re-enter), refund (`test_RefundFullLockedFunds`, `test_RefundAfterPartialRelease`, `test_RefundNothingToRefund`).

**Hal yang perlu diperhatikan / belum selesai:**
- `raiseDispute` (`Disputed`) awalnya tanpa resolve; sudah ditambahkan `resolveDispute` (Disputed → Pending) pada entri log di atas, atas keputusan user. Tidak ada UI khusus untuk dispute (sesuai scope).
- Kontrak belum di-deploy ke BSC Testnet (Hari 2, selanjutnya; sementara ditunda atas instruksi user).