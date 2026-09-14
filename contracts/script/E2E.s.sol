// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {TestToken} from "../src/TestToken.sol";

/// @notice Jalankan 1 flow lengkap end-to-end di BSC Testnet (bukan Anvil):
///         createEscrow (payer) -> submitProof (recipient) -> autoRelease (agent).
///         Perlu set dulu setelah deploy: CONTRACT_ADDRESS, TOKEN_ADDRESS.
///
/// Usage:
///   cd contracts
///   forge script script/E2E.s.sol:E2E \
///     --rpc-url $BSC_TESTNET_RPC --broadcast
contract E2E is Script {
    function run() external {
        MilestoneEscrow escrow = MilestoneEscrow(vm.envAddress("CONTRACT_ADDRESS"));
        TestToken token = TestToken(vm.envAddress("TOKEN_ADDRESS"));

        _mintAndApprove(token, address(escrow), _payer());
        uint256 escrowId = _createEscrow(escrow, token, _recipient());
        _submitProof(escrow, escrowId);
        _autoRelease(escrow, escrowId);
        _verifyState(escrow, token, escrowId, _recipient());
    }

    function _payer() private view returns (address) {
        return vm.addr(vm.envUint("PAYER_PRIVATE_KEY"));
    }

    function _recipient() private view returns (address) {
        return vm.addr(vm.envUint("RECIPIENT_PRIVATE_KEY"));
    }

    function _mintAndApprove(TestToken token, address escrow_, address payer) private {
        console.log("Payer:", payer);
        console.log("Recipient:", _recipient());
        console.log("Agent:", vm.addr(vm.envUint("AGENT_PRIVATE_KEY")));

        vm.startBroadcast(vm.envUint("PAYER_PRIVATE_KEY"));
        token.mint(payer, 1000 ether);
        token.approve(escrow_, type(uint256).max);
        vm.stopBroadcast();
    }

    function _createEscrow(
        MilestoneEscrow escrow,
        TestToken token,
        address recipient
    ) private returns (uint256 escrowId) {
        MilestoneEscrow.Milestone[] memory ms = new MilestoneEscrow.Milestone[](1);
        ms[0] = MilestoneEscrow.Milestone({
            amount: 100 ether,
            proofRequirement: "E2E testnet: script deploy + verifikasi status milestone",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });

        vm.startBroadcast(vm.envUint("PAYER_PRIVATE_KEY"));
        escrowId = escrow.createEscrow(recipient, address(token), ms);
        vm.stopBroadcast();
        console.log("1. createEscrow -> escrowId", escrowId);
    }

    function _submitProof(MilestoneEscrow escrow, uint256 escrowId) private {
        vm.startBroadcast(vm.envUint("RECIPIENT_PRIVATE_KEY"));
        escrow.submitProof(escrowId, 0, "E2E: kontrak terdeploy, bukti diverifikasi by script");
        vm.stopBroadcast();
        console.log("2. submitProof done");
    }

    function _autoRelease(MilestoneEscrow escrow, uint256 escrowId) private {
        vm.startBroadcast(vm.envUint("AGENT_PRIVATE_KEY"));
        escrow.autoRelease(escrowId, 0);
        vm.stopBroadcast();
        console.log("3. autoRelease done");
    }

    function _verifyState(
        MilestoneEscrow escrow,
        TestToken token,
        uint256 escrowId,
        address recipient
    ) private view {
        (uint256 amount, , , MilestoneEscrow.MilestoneStatus status) = escrow.getMilestone(escrowId, 0);
        console.log("Milestone status:", uint256(status));
        console.log("Milestone amount:", amount);
        console.log("Recipient balance:", token.balanceOf(recipient));
        console.log("Escrow balance:", token.balanceOf(address(escrow)));
    }
}