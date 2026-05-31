// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PrismCollateralVault.sol";

/// @notice Whitelist the initial token set on a deployed vault.
///
/// Run this immediately after Deploy.s.sol. The deployer must be the Safe
/// owner (or this must be executed as a Safe tx) because addToken() is
/// onlyAdmin. On testnets, GNOSIS_SAFE_ADDRESS is often an EOA for speed.
///
/// Usage:
///   VAULT_ADDRESS=0x... forge script script/AddTokens.s.sol \
///     --rpc-url base_sepolia --broadcast -vvvv
///
/// Token addresses are read from env vars so the same script works on any chain.
/// Set the relevant vars in your .env before running.
contract AddTokens is Script {
    function run() external {
        uint256 adminKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address vaultAddr = vm.envAddress("VAULT_ADDRESS");

        PrismCollateralVault vault = PrismCollateralVault(payable(vaultAddr));

        // Load token addresses — each is optional; skip if not set.
        address usdc = vm.envOr("TOKEN_USDC", address(0));
        address usdt = vm.envOr("TOKEN_USDT", address(0));
        address weth = vm.envOr("TOKEN_WETH", address(0));
        address wbtc = vm.envOr("TOKEN_WBTC", address(0));

        vm.startBroadcast(adminKey);

        if (usdc != address(0)) { vault.addToken(usdc); console.log("Added USDC :", usdc); }
        if (usdt != address(0)) { vault.addToken(usdt); console.log("Added USDT :", usdt); }
        if (weth != address(0)) { vault.addToken(weth); console.log("Added wETH :", weth); }
        if (wbtc != address(0)) { vault.addToken(wbtc); console.log("Added wBTC :", wbtc); }

        vm.stopBroadcast();

        console.log("Token whitelist updated on vault:", vaultAddr);
    }
}
