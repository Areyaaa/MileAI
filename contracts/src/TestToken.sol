// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test token mintable untuk flow E2E di BSC Testnet.
///         HANYA untuk pengujian — bukan token produksi.
contract TestToken is ERC20 {
    constructor() ERC20("MileAI Test Token", "MILE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}