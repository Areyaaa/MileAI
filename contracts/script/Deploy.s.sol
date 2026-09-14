// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {MilestoneEscrow} from "../src/MilestoneEscrow.sol";
import {TestToken} from "../src/TestToken.sol";

/// @notice Deploy MilestoneEscrow + TestToken ke BSC Testnet dan grant
///         AI_AGENT_ROLE ke wallet agent. Semua key dibaca dari .env —
///         JANGAN pernah hardcode key.
///
/// Usage:
///   cd contracts
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $BSC_TESTNET_RPC \
///     --broadcast --verify
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        uint256 agentKey = vm.envUint("AGENT_PRIVATE_KEY");
        address agent = vm.addr(agentKey);

        vm.startBroadcast(deployerKey);

        TestToken token = new TestToken();
        MilestoneEscrow escrow = new MilestoneEscrow();
        escrow.grantRole(escrow.AI_AGENT_ROLE(), agent);

        vm.stopBroadcast();

        console.log("=== DEPLOY DONE ===");
        console.log("Deployer:", deployer);
        console.log("TestToken:", address(token));
        console.log("MilestoneEscrow:", address(escrow));
        console.log("Agent with AI_AGENT_ROLE:", agent);
        console.log("SAVE these addresses to .env: CONTRACT_ADDRESS & TOKEN_ADDRESS");
    }
}