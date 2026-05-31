// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PrismCollateralVault.sol";

/// @notice Deploy PrismCollateralVault to any chain.
///
/// Usage (testnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url base_sepolia --broadcast --verify \
///     -vvvv
///
/// Usage (mainnet):
///   forge script script/Deploy.s.sol \
///     --rpc-url base --broadcast --verify \
///     -vvvv
///
/// Required env vars:
///   DEPLOYER_PRIVATE_KEY   — deployer EOA key (funds the tx)
///   GNOSIS_SAFE_ADDRESS    — 2-of-3 Safe that will own the vault
///
/// The initial token list is empty at deploy — run AddTokens.s.sol next.
contract Deploy is Script {
    function run() external {
        uint256 deployerKey  = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address gnosisSafe   = vm.envAddress("GNOSIS_SAFE_ADDRESS");

        vm.startBroadcast(deployerKey);

        address[] memory initialTokens = new address[](0);
        PrismCollateralVault vault = new PrismCollateralVault(gnosisSafe, initialTokens);

        vm.stopBroadcast();

        console.log("PrismCollateralVault deployed:");
        console.log("  address :", address(vault));
        console.log("  admin   :", vault.admin());
        console.log("  chain   :", block.chainid);
    }
}
