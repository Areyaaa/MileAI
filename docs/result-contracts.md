# Hasil Pengujian — Smart Contract `MilestoneEscrow.sol`

| Item | Detail |
|---|---|
| **Tanggal** | 2026-09-14 16:41 WIB |
| **Kontrak** | `contracts/src/MilestoneEscrow.sol` |
| **Test file** | `contracts/test/MilestoneEscrow.t.sol` |
| **Tool** | Forge (Foundry v1.8.0 via WSL), Solc 0.8.23, `evm_version = london` |
| **Dependencies** | OpenZeppelin Contracts v5.0.2, forge-std v1.16.2 |

---

## 1. `forge test` — Hasil

| Metrik | Nilai |
|---|---|
| Total test | **35** |
| Passed | **35** |
| Failed | **0** |
| Fuzz runs per test fuzz | **256 runs** |

### Daftar test per kategori

| Kategori | Jumlah test | Contoh nama test |
|---|---|---|
| Happy path (create → submit → release) | 1 | `test_FlowCreateSubmitAutoRelease` |
| Akses control (role, per-escrow auth) | 5 | `test_NonAgentCannotAutoRelease`, `test_OnlyRecipientCanSubmitProof`, `test_ManualApproveOnlyPayerOfThatEscrow`, `test_RefundOnlyPayerOfThatEscrow`, `test_AutoReleaseReturnsToReleaseReverts` |
| Reentrancy (MaliciousToken hook) | 3 | `test_ReentrancyBlocksAutoRelease`, `test_ReentrancyBlocksManualApprove`, `test_ReentrancyBlocksRefund` |
| Refund | 4 | `test_RefundFullLockedFunds`, `test_RefundAfterPartialRelease`, `test_RefundNothingToRefund`, `test_RefundAllReleasedRevertsWithoutDoubleSpend` |
| Status guard / idempotency | 3 | `test_SubmitProofCannotRunTwice`, `test_AutoReleaseOnNonSubmittedReverts`, `test_ManualApproveOnPendingReverts` |
| Bounds checking | 2 | `test_InvalidEscrowIdReverts`, `test_InvalidMilestoneIndexReverts` |
| createEscrow validation | 5 | `test_CreateEscrowTooManyMilestones`, `test_CreateEscrowNoMilestonesReverts`, `test_CreateEscrowZeroAmountReverts`, `test_CreateEscrowEmptyRequirementReverts`, `test_CreateEscrowZeroAddressReverts` |
| createEscrow max milestone | 1 | `test_CreateEscrowMaxMilestonesRecordsTotal` |
| Dispute (raise + resolve) | 4 | `test_RaiseDisputeBlocksReleaseAndOnlyParties`, `test_RaiseDisputeOnlyOnSubmitted`, `test_ResolveDisputeBackToPendingThenResubmit`, `test_ResolveDisputeOnlyPartiesAndOnDisputed` |
| Refunded guard (operasi dibekukan) | 2 | `test_NoOperationsAfterRefund`, `test_DisputeOpsAfterRefundReverts` |
| Fuzz — createEscrow | 1 | `testFuzz_CreateEscrowTransfersTotal` |
| Fuzz — autoRelease | 1 | `testFuzz_AutoReleaseInvalidInputsAlwaysRevert` |
| Fuzz — manualApprove | 1 | `testFuzz_ManualApproveInvalidInputsAlwaysRevert` |
| Empty proof / status post-release | 3 | `test_EmptyProofReverts`, `test_ManualApproveAfterReleaseReverts`, `test_InvalidMilestoneIndexReverts` |

---

## 2. `forge coverage --report summary` — Hasil

**`src/MilestoneEscrow.sol`**

| Metrik | Hasil |
|---|---|
| **Lines** | **100.00%** (100/100) |
| **Statements** | **100.00%** (133/133) |
| **Branches** | **100.00%** (26/26) |
| **Functions** | **100.00%** (12/12) |

Semua fungsi yang memindahkan dana (`autoRelease`, `manualApprove`, `refund`) memiliki branch coverage penuh (guard `AlreadyRefunded`, status guard, auth per-escrow).

---

## 3. `forge test --gas-report` — Hasil

### Deployment

| Metrik | Nilai |
|---|---|
| Deployment size | **6.973 bytes** (batas EIP-170: 24.576 bytes) |

### Per-fungsi

| Fungsi | Min | Avg | Median | Max | # Calls |
|---|---|---|---|---|---|
| `createEscrow` | 27.965 | 295.055 | 272.740 | **703.293** | 803 |
| `autoRelease` | 29.128 | 33.121 | 31.506 | 110.455 | 271 |
| `manualApprove` | 28.927 | 29.913 | 29.191 | 110.343 | 263 |
| `refund` | 30.975 | 60.678 | 73.427 | 105.729 | 9 |
| `getMilestone` | 4.714 | 18.499 | 15.123 | 23.936 | 1.361 |
| `getEscrow` | 2.535 | 13.337 | 13.379 | 13.379 | 262 |
| `raiseDispute` | 28.168 | 35.200 | 37.073 | 39.294 | 6 |
| `resolveDispute` | 28.212 | 31.650 | 32.400 | 34.537 | 5 |
| `grantRole` | 51.458 | 51.458 | 51.458 | 51.458 | 35 |
| `MAX_MILESTONES` | 262 | 262 | 262 | 262 | 258 |
| `escrowCount` | 2.384 | 2.384 | 2.384 | 2.384 | 1 |

**Fungsi paling boros gas:** `createEscrow` — max **703.293 gas** (kasus 10 milestone × 1 ether), didominasi loop copy struct + `safeTransferFrom`.

---

## 4. Temuan Reentrancy

| Fungsi diuji | Token | Hook dalam transfer | Hasil |
|---|---|---|---|
| `autoRelease` | `MaliciousToken` | `abi.encodeWithSelector(autoRelease)` | ✅ Diblokir ReentrancyGuard — `reenterSucceeded == false`, dana cair tepat 1× ke recipient. |
| `manualApprove` | `MaliciousToken` | `abi.encodeWithSelector(manualApprove)` | ✅ Diblokir — `reenterSucceeded == false`, dana cair tepat 1×. |
| `refund` | `MaliciousToken` | `abi.encodeWithSelector(refund)` | ✅ Diblokir — `reenterSucceeded == false`, dana kembali tepat 1× ke payer, `refunded == true`. |

**Kesimpulan reentrancy:** `ReentrancyGuard` (`nonReentrant`) pada semua fungsi transfer dana berfungsi. Selain nonReentrant, status guard (checks-effects-interactions) juga mencegah double-spend — status `Released`/`refunded` diubah sebelum transfer.

---

## 5. Temuan Fuzz (`vm.assume`)

| Test | Temuan |
|---|---|
| `testFuzz_CreateEscrowTransfersTotal` (count 1–10, amount >0) | Total token terkunci selalu == jumlah semua milestone amount; balance payer berkurang tepat; setiap milestone amount & status cocok. |
| `testFuzz_AutoReleaseInvalidInputsAlwaysRevert` | Semua input di luar `(escrowId=0, milestoneIndex=0)` selalu revert — tidak ada eksekusi parsial. Balance escrow & recipient tidak berubah setelah revert. |
| `testFuzz_ManualApproveInvalidInputsAlwaysRevert` | Sama — semua input acak di luar titik valid yang di-submit → revert tanpa efek samping. |

---

## 6. Keputusan Desain yang Diuji & Diverifikasi

| Skenario | Perilaku kontrak | Verifikasi test |
|---|---|---|
| Refund saat **semua milestone Released** | Revert `NothingToRefund` (bukan return-0, atas keputusan user) | `test_RefundAllReleasedRevertsWithoutDoubleSpend` — revert, balance & status tidak berubah. |
| Dispute lalu resolve → submit ulang → release | Disputed → Pending → Submitted → Released → dana cair ke recipient | `test_ResolveDisputeBackToPendingThenResubmit`. |
| Setelah refund, operasi lain dibekukan | `submitProof`, `manualApprove`, `autoRelease`, `raiseDispute`, `resolveDispute` semuanya revert `AlreadyRefunded` | `test_NoOperationsAfterRefund`, `test_DisputeOpsAfterRefundReverts`. |

---

## 7. Catatan Batas Pengujian

- **Fuzz 256 runs** per test — cukup untuk hipotese validitas umum; untuk fuzz yang lebih agresif (ribuan/hingga juta runs) diperlukan Echidna/medusa atau Foundry fuzz dengan `--fuzz-runs 10000`.
- **Tidak ada simulasi gas price nyata / block time** — hanya gas unit per transaksi.
- **Tidak ada simulasi kontrak multi-interaksi** — hanya escrow vs satu token vs satu agent; tidak mencakup skenarioWithMany escrow simultan atau race condition antar-transaksi di pool.
- **Keamanan kontrak belum diuji di testnet** — test hanya menggunakan Anvil (lingkungan lokal Foundry). Potensi edge case EVM-level (mis. gas schedule BSC spesifik) belum dieksplor.
- **Kontrak tidak mengimplementasi** administrative override, time-lock, atau emergency pause — sesuai scope MVP (PRD/AGENTS.md).