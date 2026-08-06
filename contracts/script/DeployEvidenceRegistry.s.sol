// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";

/// @title DeployEvidenceRegistry
/// @notice Forge broadcast script for deploying EvidenceRegistry to any EVM network.
///
/// Usage (local Anvil):
///   1. Start Anvil in a separate terminal:
///        anvil
///   2. Export the deployer key (use Anvil's first default account):
///        export DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
///   3. Run the broadcast:
///        forge script script/DeployEvidenceRegistry.s.sol \
///          --rpc-url http://127.0.0.1:8545 \
///          --broadcast \
///          -vvvv
///
/// The deployed contract address is printed to the console and written to
/// broadcast/DeployEvidenceRegistry.s.sol/<chainId>/run-latest.json.
contract DeployEvidenceRegistry is Script {
    function run() external returns (EvidenceRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("=== Glass Fortress: EvidenceRegistry Deployment ===");
        console.log("Deployer address :", deployer);
        console.log("Chain ID         :", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        registry = new EvidenceRegistry();

        vm.stopBroadcast();

        console.log("EvidenceRegistry deployed at:", address(registry));
        console.log("DEFAULT_ADMIN_ROLE held by  :", deployer);
        console.log("REGISTRAR_ROLE held by      :", deployer);
    }
}
