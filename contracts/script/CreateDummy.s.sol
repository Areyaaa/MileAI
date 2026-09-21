// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {TestToken} from "../src/TestToken.sol";

/// @notice Buat 1 escrow dummy di BSC Testnet untuk demo/QA: payer = 0x996...,
///         recipient = 0x417... . Hanya createEscrow (belum submitProof/autoRelease).
///         Baca CONTRACT_ADDRESS, TOKEN_ADDRESS, PAYER_PRIVATE_KEY dari contracts/.env.
///
/// Usage:
///   cd contracts
///   forge script script/CreateDummy.s.sol:CreateDummy --rpc-url $BSC_TESTNET_RPC --broadcast
contract CreateDummy is Script {
    address constant RECIPIENT = 0x41794f558baCc4C1a739E11bBB49BBF7d083A217;

    function run() external {
        MilestoneEscrow escrow = MilestoneEscrow(vm.envAddress("CONTRACT_ADDRESS"));
        TestToken token = TestToken(vm.envAddress("TOKEN_ADDRESS"));
        address payer = vm.addr(vm.envUint("PAYER_PRIVATE_KEY"));

        uint256 amount = 100 ether;
        vm.startBroadcast(vm.envUint("PAYER_PRIVATE_KEY"));

        if (token.allowance(payer, address(escrow)) < amount) {
            token.approve(address(escrow), type(uint256).max);
        }

        MilestoneEscrow.Milestone[] memory ms = new MilestoneEscrow.Milestone[](1);
        ms[0] = MilestoneEscrow.Milestone({
            amount: amount,
            proofRequirement: "Dummy milestone: implementasikan fitur X lalu kirim bukti kerja (PR link / deskripsi).",
            proofText: "",
            status: MilestoneEscrow.MilestoneStatus.Pending
        });

        uint256 escrowId = escrow.createEscrow(RECIPIENT, address(token), ms);
        vm.stopBroadcast();

        console.log("Payer   :", payer);
        console.log("Recipient:", RECIPIENT);
        console.log("escrowId:", escrowId);
    }
}