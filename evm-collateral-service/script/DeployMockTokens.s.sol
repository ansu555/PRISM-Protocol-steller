// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/MockERC20.sol";
import "../src/PrismCollateralVault.sol";

/// @notice Deploy mock USDC + wETH, whitelist them on the vault, and mint
///         a test supply to the deployer for immediate testing.
///
/// Usage:
///   VAULT_ADDRESS=0x... forge script script/DeployMockTokens.s.sol \
///     --rpc-url eth_sepolia --broadcast -vvvv
contract DeployMockTokens is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address vaultAddr    = vm.envAddress("VAULT_ADDRESS");
        address deployer     = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // Deploy mock tokens
        MockERC20 usdc = new MockERC20("USD Coin (Test)", "USDC", 6);
        MockERC20 weth = new MockERC20("Wrapped Ether (Test)", "WETH", 18);

        // Mint a generous test supply to the deployer
        usdc.mint(deployer, 10_000_000 * 1e6);   // 10M USDC
        weth.mint(deployer, 1_000 * 1e18);        // 1,000 wETH

        // Whitelist both on the vault (replaces old addresses)
        PrismCollateralVault vault = PrismCollateralVault(payable(vaultAddr));
        vault.addToken(address(usdc));
        vault.addToken(address(weth));

        vm.stopBroadcast();

        console.log("MockUSDC deployed :", address(usdc));
        console.log("MockWETH deployed  :", address(weth));
        console.log("Both whitelisted on vault:", vaultAddr);
        console.log("Minted to deployer :", deployer);
    }
}
