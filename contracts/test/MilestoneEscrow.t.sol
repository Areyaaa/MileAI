// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";

contract TestERC20 is ERC20 {
    constructor() ERC20("Test", "TST") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Token "jahat": ketika escrow mentransfer dana keluar (safeTransfer),
///         token mencoba re-enter fungsi kontrak lewat hook transfer. Payload
///         dipilih per-test (autoRelease / manualApprove / refund).
contract MaliciousToken is ERC20 {
    MilestoneEscrow public escrow;
    bytes public payload;
    bool public reentered;
    bool public reenterSucceeded;

    constructor() ERC20("Bad", "BAD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setup(MilestoneEscrow _escrow, bytes calldata _payload) external {
        escrow = _escrow;
        payload = _payload;
    }

    function transfer(address to, uint256 amount) public override returns (bool) {
        if (!reentered && address(escrow) != address(0)) {
            reentered = true;
            (bool ok, ) = address(escrow).call(payload);
            reenterSucceeded = ok;
        }
        return super.transfer(to, amount);
    }
}

/// @notice ERC20 non-standar: `transfer()` me-return `false` alih-alih revert
///         saat gagal (silent-fail). SafeERC20 di kontrak harus menangkap ini.
contract FalseTransferERC20 is ERC20 {
    constructor() ERC20("FalseTransfer", "FTR") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transfer(address, uint256) public pure override returns (bool) {
        return false; // silent fail, tanpa revert
    }
}

/// @notice ERC20 non-standar: `transferFrom()` me-return `false` alih-alih revert
///         saat gagal. `createEscrow` (safeTransferFrom) harus menangkap ini.
contract FalseTransferFromERC20 is ERC20 {
    constructor() ERC20("FalseTransferFrom", "FTF") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false; // silent fail, tanpa revert
    }
}

contract MilestoneEscrowTest is Test {
    MilestoneEscrow public escrow;
    TestERC20 public token;
    MaliciousToken public malicious;

    address public payer = makeAddr("payer");
    address public recipient = makeAddr("recipient");
    address public agent = makeAddr("agent");
    address public stranger = makeAddr("stranger");

    uint256 public constant INITIAL = 10_000 ether;
    bytes32 internal constant AI_ROLE = keccak256("AI_AGENT_ROLE");

    function setUp() public {
        escrow = new MilestoneEscrow();
        token = new TestERC20();
        malicious = new MaliciousToken();

        token.mint(payer, INITIAL);
        malicious.mint(payer, INITIAL);
        vm.prank(payer);
        token.approve(address(escrow), type(uint256).max);
        vm.prank(payer);
        malicious.approve(address(escrow), type(uint256).max);

        escrow.grantRole(AI_ROLE, agent);
    }

    // ---------- Helper ----------

    function _one(uint256 amount) internal pure returns (MilestoneEscrow.Milestone[] memory arr) {
        arr = new MilestoneEscrow.Milestone[](1);
        arr[0] = MilestoneEscrow.Milestone({
            amount: amount,
            proofRequirement: "Kirim contract yang sudah diverifikasi di BSC Testnet",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });
    }

    function _three() internal pure returns (MilestoneEscrow.Milestone[] memory arr) {
        arr = new MilestoneEscrow.Milestone[](3);
        arr[0] = MilestoneEscrow.Milestone({
            amount: 10 ether,
            proofRequirement: "Milestone 1",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });
        arr[1] = MilestoneEscrow.Milestone({
            amount: 20 ether,
            proofRequirement: "Milestone 2",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });
        arr[2] = MilestoneEscrow.Milestone({
            amount: 30 ether,
            proofRequirement: "Milestone 3",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });
    }

    function _ten() internal view returns (MilestoneEscrow.Milestone[] memory arr) {
        uint256 n = escrow.MAX_MILESTONES(); // = 10
        arr = new MilestoneEscrow.Milestone[](n);
        for (uint256 i = 0; i < n; ++i) {
            arr[i] = MilestoneEscrow.Milestone({
                amount: 1 ether,
                proofRequirement: "Milestone iterasi",
                proofText: "",
                status: MilestoneEscrow.MilestoneStatus.Pending
            });
        }
    }

    function _createOne(uint256 amount) internal returns (uint256 escrowId) {
        vm.prank(payer);
        escrowId = escrow.createEscrow(recipient, address(token), _one(amount));
    }

    function _createOneWithToken(address tok, uint256 amount) internal returns (uint256 escrowId) {
        vm.prank(payer);
        escrowId = escrow.createEscrow(recipient, tok, _one(amount));
    }

    function _createAndSubmit(uint256 amount) internal returns (uint256 escrowId) {
        escrowId = _createOne(amount);
        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "Selesai: kontrak ter-deploy di 0xabc, test lolos");
    }

    function _status(uint256 escrowId, uint256 index) internal view returns (MilestoneEscrow.MilestoneStatus s) {
        (, , , MilestoneEscrow.MilestoneStatus status) = escrow.getMilestone(escrowId, index);
        s = status;
    }

    // ---------- 1. Skenario sukses: create -> submit -> autoRelease ----------

    function test_FlowCreateSubmitAutoRelease() public {
        uint256 amount = 100 ether;

        vm.expectEmit(address(escrow));
        emit MilestoneEscrow.EscrowCreated(0, payer, recipient, address(token), amount);
        uint256 escrowId = _createOne(amount);

        assertEq(token.balanceOf(address(escrow)), amount);
        assertEq(escrow.escrowCount(), 1);

        vm.expectEmit(address(escrow));
        emit MilestoneEscrow.ProofSubmitted(escrowId, 0, "Selesai: kontrak ter-deploy di 0xabc, test lolos");
        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "Selesai: kontrak ter-deploy di 0xabc, test lolos");
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));

        vm.expectEmit(address(escrow));
        emit MilestoneEscrow.MilestoneReleased(escrowId, 0, recipient, amount);
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    // ---------- 2. Akses control ----------

    function test_NonAgentCannotAutoRelease() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSignature("AccessControlUnauthorizedAccount(address,bytes32)", stranger, AI_ROLE)
        );
        escrow.autoRelease(escrowId, 0);

        // Payer juga bukan AI agent.
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSignature("AccessControlUnauthorizedAccount(address,bytes32)", payer, AI_ROLE)
        );
        escrow.autoRelease(escrowId, 0);
    }

    function test_OnlyRecipientCanSubmitProof() public {
        uint256 escrowId = _createOne(10 ether);

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.NotRecipient.selector);
        escrow.submitProof(escrowId, 0, "curang");

        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.NotRecipient.selector);
        escrow.submitProof(escrowId, 0, "curang");
    }

    function test_ManualApproveOnlyPayerOfThatEscrow() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        // Payer escrow lain (stranger) tidak boleh approve.
        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.NotPayer.selector);
        escrow.manualApprove(escrowId, 0);

        // Payer yang benar bisa.
        vm.prank(payer);
        escrow.manualApprove(escrowId, 0);
        assertEq(token.balanceOf(recipient), 10 ether);
    }

    function test_RefundOnlyPayerOfThatEscrow() public {
        uint256 escrowId = _createOne(10 ether);

        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.NotPayer.selector);
        escrow.refund(escrowId);
    }

    // ---------- 3. Reentrancy: MaliciousToken coba re-enter lewat hook transfer ----------

    function test_ReentrancyBlocksAutoRelease() public {
        uint256 amount = 50 ether;
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(malicious), _one(amount));

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "bukti normal");

        malicious.setup(
            escrow,
            abi.encodeWithSelector(MilestoneEscrow.autoRelease.selector, escrowId, uint256(0))
        );

        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        // Panggilan ulang dari dalam token harus digagalkan ReentrancyGuard.
        assertFalse(malicious.reenterSucceeded());
        // Dana dicairkan tepat satu kali.
        assertEq(malicious.balanceOf(recipient), amount);
        assertEq(malicious.balanceOf(address(escrow)), 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    function test_ReentrancyBlocksManualApprove() public {
        uint256 amount = 50 ether;
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(malicious), _one(amount));

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "bukti normal");

        malicious.setup(
            escrow,
            abi.encodeWithSelector(MilestoneEscrow.manualApprove.selector, escrowId, uint256(0))
        );

        vm.prank(payer);
        escrow.manualApprove(escrowId, 0);

        assertFalse(malicious.reenterSucceeded());
        assertEq(malicious.balanceOf(recipient), amount); // hanya sekali
        assertEq(malicious.balanceOf(address(escrow)), 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    function test_ReentrancyBlocksRefund() public {
        uint256 amount = 50 ether;
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(malicious), _one(amount));

        malicious.setup(escrow, abi.encodeWithSelector(MilestoneEscrow.refund.selector, escrowId));

        vm.prank(payer);
        escrow.refund(escrowId);

        assertFalse(malicious.reenterSucceeded());
        // Dana utuh kembali sekali ke payer; tidak ada double-spend.
        assertEq(malicious.balanceOf(payer), INITIAL);
        assertEq(malicious.balanceOf(address(escrow)), 0);
        (, , , , bool refunded) = escrow.getEscrow(escrowId);
        assertTrue(refunded);
    }

    // ---------- 4. Refund ----------

    function test_RefundFullLockedFunds() public {
        uint256 amount = 100 ether;
        uint256 escrowId = _createOne(amount);

        vm.prank(payer);
        escrow.refund(escrowId);

        assertEq(token.balanceOf(payer), INITIAL); // kembali penuh, belum ada yang cair
        assertEq(token.balanceOf(address(escrow)), 0);

        // Refund kedua diblokir (idempotent).
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.refund(escrowId);
    }

    function test_RefundAfterPartialRelease() public {
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(token), _three());

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "m1 selesai");
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        assertEq(token.balanceOf(recipient), 10 ether);

        vm.prank(payer);
        escrow.refund(escrowId);

        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(payer), INITIAL - 10 ether);
        // Milestone yang belum Released ikut kehitung (10 + 20 + 30 - 10 = 50).
        (, , , , bool refunded) = escrow.getEscrow(escrowId);
        assertTrue(refunded);
    }

    function test_RefundNothingToRefund() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.NothingToRefund.selector);
        escrow.refund(escrowId);
    }

    // ---------- 5. Edge case: seluruh milestone Released lalu refund ----------

    /// Requirement dari user: refund saat semua milestone sudah Released harus
    /// tidak menghasilkan apa pun (anti double-spend). Kontrak memilih revert
    /// `NothingToRefund` (keputusan user) — test memastikan tidak ada dana
    /// berpindah dan state tidak berubah.
    function test_RefundAllReleasedRevertsWithoutDoubleSpend() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);
        assertEq(token.balanceOf(recipient), 10 ether);

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.NothingToRefund.selector);
        escrow.refund(escrowId);

        // Tidak ada double-spend / state tidak berubah.
        assertEq(token.balanceOf(address(escrow)), 0);
        assertEq(token.balanceOf(recipient), 10 ether);
        assertEq(token.balanceOf(payer), INITIAL - 10 ether);
        (, , , , bool refunded) = escrow.getEscrow(escrowId);
        assertFalse(refunded);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    // ---------- 6. Fuzz: createEscrow dengan jumlah & amount acak ----------

    function testFuzz_CreateEscrowTransfersTotal(
        uint8 _count,
        uint64[10] calldata amounts
    ) public {
        uint256 count = uint256(_count);
        vm.assume(count >= 1 && count <= escrow.MAX_MILESTONES());

        MilestoneEscrow.Milestone[] memory arr = new MilestoneEscrow.Milestone[](count);
        uint256 total;
        for (uint256 i = 0; i < count; ++i) {
            vm.assume(amounts[i] > 0);
            arr[i] = MilestoneEscrow.Milestone({
                amount: amounts[i],
                proofRequirement: "req",
                proofText: "",
                status: MilestoneEscrow.MilestoneStatus.Pending
            });
            total += amounts[i];
        }

        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(token), arr);

        // Total yang dikunci harus persis sum semua milestone amount.
        assertEq(token.balanceOf(address(escrow)), total);
        assertEq(token.balanceOf(payer), INITIAL - total);
        (, , , uint256 mc, ) = escrow.getEscrow(escrowId);
        assertEq(mc, count);
        for (uint256 i = 0; i < count; ++i) {
            (uint256 a, , , MilestoneEscrow.MilestoneStatus s) = escrow.getMilestone(escrowId, i);
            assertEq(a, amounts[i]);
            assertEq(uint256(s), uint256(MilestoneEscrow.MilestoneStatus.Pending));
        }
    }

    // ---------- 7. Fuzz: autoRelease/manualApprove dengan input acak ----------

    function testFuzz_AutoReleaseInvalidInputsAlwaysRevert(
        uint256 escrowId,
        uint256 milestoneIndex
    ) public {
        uint256 eid = _createAndSubmit(10 ether);
        vm.assume(escrowId != 0 || milestoneIndex != 0);

        vm.prank(agent);
        vm.expectRevert(); // reverts (not found / out of range / invalid status)
        escrow.autoRelease(escrowId, milestoneIndex);

        // Tidak boleh ada efek parsial.
        assertEq(token.balanceOf(address(escrow)), 10 ether);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(uint256(_status(eid, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
    }

    function testFuzz_ManualApproveInvalidInputsAlwaysRevert(
        uint256 escrowId,
        uint256 milestoneIndex
    ) public {
        uint256 eid = _createAndSubmit(10 ether);
        vm.assume(escrowId != 0 || milestoneIndex != 0);

        vm.prank(payer);
        vm.expectRevert(); // reverts (not found / out of range / invalid status)
        escrow.manualApprove(escrowId, milestoneIndex);

        assertEq(token.balanceOf(address(escrow)), 10 ether);
        assertEq(token.balanceOf(recipient), 0);
        assertEq(uint256(_status(eid, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
    }

    // ---------- 8. Idempotency / status guard ----------

    function test_SubmitProofCannotRunTwice() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.submitProof(escrowId, 0, "lagi");
    }

    function test_AutoReleaseOnNonSubmittedReverts() public {
        uint256 escrowId = _createOne(10 ether); // masih Pending

        vm.prank(agent);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.autoRelease(escrowId, 0);
    }

    function test_ManualApproveOnPendingReverts() public {
        uint256 escrowId = _createOne(10 ether); // masih Pending

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.manualApprove(escrowId, 0);
    }

    // ---------- 9. Bounds checking ----------

    function test_InvalidEscrowIdReverts() public {
        vm.expectRevert(MilestoneEscrow.EscrowNotFound.selector);
        escrow.getEscrow(0);

        vm.expectRevert(MilestoneEscrow.EscrowNotFound.selector);
        escrow.submitProof(0, 0, "x");
    }

    function test_InvalidMilestoneIndexReverts() public {
        uint256 escrowId = _createOne(10 ether);

        vm.expectRevert(MilestoneEscrow.MilestoneOutOfRange.selector);
        escrow.getMilestone(escrowId, 1);
    }

    // ---------- 10. createEscrow validation ----------

    function test_CreateEscrowTooManyMilestones() public {
        MilestoneEscrow.Milestone[] memory arr = new MilestoneEscrow.Milestone[](11);
        for (uint256 i = 0; i < 11; ++i) {
            arr[i] = MilestoneEscrow.Milestone({
                amount: 1 ether,
                proofRequirement: "r",
                proofText: "",
                status: MilestoneEscrow.MilestoneStatus.Pending
            });
        }
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.TooManyMilestones.selector);
        escrow.createEscrow(recipient, address(token), arr);
    }

    function test_CreateEscrowNoMilestonesReverts() public {
        MilestoneEscrow.Milestone[] memory arr = new MilestoneEscrow.Milestone[](0);
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.NoMilestones.selector);
        escrow.createEscrow(recipient, address(token), arr);
    }

    function test_CreateEscrowZeroAmountReverts() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ZeroMilestoneAmount.selector);
        escrow.createEscrow(recipient, address(token), _one(0));
    }

    function test_CreateEscrowEmptyRequirementReverts() public {
        MilestoneEscrow.Milestone[] memory arr = new MilestoneEscrow.Milestone[](1);
        arr[0] = MilestoneEscrow.Milestone({
            amount: 1 ether,
            proofRequirement: "",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.EmptyRequirement.selector);
        escrow.createEscrow(recipient, address(token), arr);
    }

    function test_CreateEscrowZeroAddressReverts() public {
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        escrow.createEscrow(address(0), address(token), _one(1 ether));

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.ZeroAddress.selector);
        escrow.createEscrow(recipient, address(0), _one(1 ether));
    }

    function test_CreateEscrowMaxMilestonesRecordsTotal() public {
        uint256 expected = 10 ether; // 10 * 1 ether
        MilestoneEscrow.Milestone[] memory arr = _ten(); // dihitung sebelum prank
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(token), arr);

        assertEq(token.balanceOf(address(escrow)), expected);
        assertEq(token.balanceOf(payer), INITIAL - expected);
        (, , , uint256 mc, ) = escrow.getEscrow(escrowId);
        assertEq(mc, 10);
    }

    function test_EmptyProofReverts() public {
        uint256 escrowId = _createOne(10 ether);

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.EmptyProof.selector);
        escrow.submitProof(escrowId, 0, "");
    }

    // ---------- 11. Dispute ----------

    function test_RaiseDisputeBlocksReleaseAndOnlyParties() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.NotAuthorized.selector);
        escrow.raiseDispute(escrowId, 0);

        vm.prank(recipient);
        escrow.raiseDispute(escrowId, 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Disputed));

        // Setelah Disputed, AI tidak bisa mencairkan.
        vm.prank(agent);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.autoRelease(escrowId, 0);
    }

    function test_RaiseDisputeOnlyOnSubmitted() public {
        uint256 escrowId = _createOne(10 ether); // Pending

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.raiseDispute(escrowId, 0);
    }

    function test_ResolveDisputeBackToPendingThenResubmit() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        vm.prank(recipient);
        escrow.raiseDispute(escrowId, 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Disputed));

        // Selesaikan sengketa: kembali ke Pending, recipient submit bukti baru.
        vm.prank(payer);
        escrow.resolveDispute(escrowId, 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Pending));

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "bukti revisi setelah dispute");
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        assertEq(token.balanceOf(recipient), 10 ether);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    function test_ResolveDisputeOnlyPartiesAndOnDisputed() public {
        uint256 escrowId = _createAndSubmit(10 ether);

        vm.prank(stranger);
        vm.expectRevert(MilestoneEscrow.NotAuthorized.selector);
        escrow.resolveDispute(escrowId, 0);

        // Belum di-dispute -> resolve tidak valid.
        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.resolveDispute(escrowId, 0);

        // Dispute lalu resolve oleh recipient juga diperbolehkan.
        vm.prank(recipient);
        escrow.raiseDispute(escrowId, 0);
        vm.prank(recipient);
        escrow.resolveDispute(escrowId, 0);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Pending));
    }

    function test_AutoReleaseReturnsToReleaseReverts() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        vm.prank(agent);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.autoRelease(escrowId, 0);
    }

    function test_ManualApproveAfterReleaseReverts() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.InvalidStatus.selector);
        escrow.manualApprove(escrowId, 0);
    }

    // ---------- 12. Refunded guard membekukan operasi lain ----------

    function test_NoOperationsAfterRefund() public {
        uint256 escrowId = _createOne(10 ether);
        vm.prank(payer);
        escrow.refund(escrowId);

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.submitProof(escrowId, 0, "telat");

        vm.prank(payer);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.manualApprove(escrowId, 0);

        // autoRelease juga dibekukan setelah refund.
        vm.prank(agent);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.autoRelease(escrowId, 0);
    }

    function test_DisputeOpsAfterRefundReverts() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        vm.prank(payer);
        escrow.refund(escrowId);

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.raiseDispute(escrowId, 0);

        vm.prank(recipient);
        vm.expectRevert(MilestoneEscrow.AlreadyRefunded.selector);
        escrow.resolveDispute(escrowId, 0);
    }

    // ---------- 13. SafeERC20: token non-standar yang me-return false ----------

    /// createEscrow -> safeTransferFrom. Kalau transferFrom me-return false
    /// (silent-fail), SafeERC20 harus revert, bukan terus diam-diam sukses.
    function test_CreateEscrowRevertsOnFalseTransferFrom() public {
        FalseTransferFromERC20 badToken = new FalseTransferFromERC20();
        badToken.mint(payer, 100 ether);
        vm.prank(payer);
        badToken.approve(address(escrow), type(uint256).max);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken))
        );
        escrow.createEscrow(recipient, address(badToken), _one(10 ether));

        // Tidak ada apa pun yang dikunci & no partial state.
        assertEq(badToken.balanceOf(address(escrow)), 0);
        assertEq(escrow.escrowCount(), 0);
    }

    /// autoRelease -> safeTransfer. transfer me-return false -> SafeERC20 revert.
    function test_AutoReleaseRevertsOnFalseTransfer() public {
        FalseTransferERC20 badToken = new FalseTransferERC20();
        badToken.mint(payer, 100 ether);
        vm.prank(payer);
        badToken.approve(address(escrow), type(uint256).max);

        // transferFrom normal (tidak di-override) -> createEscrow sukses, token masuk escrow.
        uint256 escrowId = _createOneWithToken(address(badToken), 10 ether);
        assertEq(badToken.balanceOf(address(escrow)), 10 ether);

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "bukti selesai");

        // transfer() me-return false -> SafeERC20 harus revert, dana tetap di escrow.
        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken))
        );
        escrow.autoRelease(escrowId, 0);

        assertEq(badToken.balanceOf(recipient), 0);
        assertEq(badToken.balanceOf(address(escrow)), 10 ether);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
    }

    /// manualApprove -> safeTransfer. transfer me-return false -> SafeERC20 revert.
    function test_ManualApproveRevertsOnFalseTransfer() public {
        FalseTransferERC20 badToken = new FalseTransferERC20();
        badToken.mint(payer, 100 ether);
        vm.prank(payer);
        badToken.approve(address(escrow), type(uint256).max);

        uint256 escrowId = _createOneWithToken(address(badToken), 10 ether);

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "bukti selesai");

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken))
        );
        escrow.manualApprove(escrowId, 0);

        assertEq(badToken.balanceOf(recipient), 0);
        assertEq(badToken.balanceOf(address(escrow)), 10 ether);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
    }

    /// refund -> safeTransfer. transfer me-return false -> SafeERC20 revert,
    /// dana tetap terkunci & refunded tetap false.
    function test_RefundRevertsOnFalseTransfer() public {
        FalseTransferERC20 badToken = new FalseTransferERC20();
        badToken.mint(payer, 100 ether);
        vm.prank(payer);
        badToken.approve(address(escrow), type(uint256).max);

        uint256 escrowId = _createOneWithToken(address(badToken), 10 ether);

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(badToken))
        );
        escrow.refund(escrowId);

        assertEq(badToken.balanceOf(payer), 90 ether); // tidak kembali
        assertEq(badToken.balanceOf(address(escrow)), 10 ether); // masih terkunci
        (, , , , bool refunded) = escrow.getEscrow(escrowId);
        assertFalse(refunded);
    }

    // ---------- 14. Rotasi wallet agent: revoke AI_AGENT_ROLE ----------

    /// Admin me-revoke role agent; agent yang sudah di-revoke tidak boleh
    /// autoRelease lagi meskipun milestone valid (status Submitted).
    function test_RevokedAgentCannotAutoRelease() public {
        uint256 escrowId = _createAndSubmit(10 ether);
        assertTrue(escrow.hasRole(AI_ROLE, agent));

        // Payer tidak punya DEFAULT_ADMIN_ROLE (0x00) -> tidak bisa revoke agent.
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)",
                payer,
                bytes32(0)
            )
        );
        escrow.revokeRole(AI_ROLE, agent);

        // Test contract adalah DEFAULT_ADMIN_ROLE (deployer) -> bisa revoke.
        escrow.revokeRole(AI_ROLE, agent);
        assertFalse(escrow.hasRole(AI_ROLE, agent));

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSignature("AccessControlUnauthorizedAccount(address,bytes32)", agent, AI_ROLE)
        );
        escrow.autoRelease(escrowId, 0);

        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
        assertEq(token.balanceOf(recipient), 0);
        assertEq(token.balanceOf(address(escrow)), 10 ether);

        // Rotasi: grant ke agent baru, agent baru bisa release.
        address newAgent = makeAddr("newAgent");
        escrow.grantRole(AI_ROLE, newAgent);
        vm.prank(newAgent);
        escrow.autoRelease(escrowId, 0);
        assertEq(token.balanceOf(recipient), 10 ether);
        assertEq(uint256(_status(escrowId, 0)), uint256(MilestoneEscrow.MilestoneStatus.Released));
    }

    /// Revoke di tengah perjalanan juga membekukan milestone lain yang sudah
    /// Submitted — role dipertanyakan pada setiap transaksi, bukan per-escrow.
    function test_RevokedAgentCannotReleaseOtherSubmittedMilestone() public {
        vm.prank(payer);
        uint256 escrowId = escrow.createEscrow(recipient, address(token), _three());

        vm.prank(recipient);
        escrow.submitProof(escrowId, 0, "m1 selesai");
        vm.prank(recipient);
        escrow.submitProof(escrowId, 1, "m2 selesai");

        // m1 cair duluan oleh agent, baru role di-revoke.
        vm.prank(agent);
        escrow.autoRelease(escrowId, 0);

        escrow.revokeRole(AI_ROLE, agent);

        vm.prank(agent);
        vm.expectRevert(
            abi.encodeWithSignature("AccessControlUnauthorizedAccount(address,bytes32)", agent, AI_ROLE)
        );
        escrow.autoRelease(escrowId, 1);

        assertEq(uint256(_status(escrowId, 1)), uint256(MilestoneEscrow.MilestoneStatus.Submitted));
        assertEq(token.balanceOf(recipient), 10 ether); // hanya m1 yang cair
        assertEq(token.balanceOf(address(escrow)), 50 ether); // m2+m3 tetap terkunci
    }
}