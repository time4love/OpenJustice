// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract EvidenceRegistryTest is Test {
    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    EvidenceRegistry public registry;

    address public deployer   = makeAddr("deployer");
    address public registrar  = makeAddr("registrar");
    address public stranger   = makeAddr("stranger");

    bytes32 public constant REGISTRAR_ROLE    = keccak256("REGISTRAR_ROLE");
    bytes32 public constant DEFAULT_ADMIN_ROLE = bytes32(0);

    bytes32 internal constant HASH_A = keccak256("evidence-file-A");
    bytes32 internal constant HASH_B = keccak256("evidence-file-B");
    string  internal constant CAT_A  = "side-effect-data";
    string  internal constant CAT_B  = "regulatory-document";

    // -------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------

    function setUp() public {
        vm.prank(deployer);
        registry = new EvidenceRegistry();
    }

    // =========================================================================
    // Deployment & role bootstrapping
    // =========================================================================

    function test_DeployerHasDefaultAdminRole() public view {
        assertTrue(registry.hasRole(DEFAULT_ADMIN_ROLE, deployer));
    }

    function test_DeployerHasRegistrarRole() public view {
        assertTrue(registry.hasRole(REGISTRAR_ROLE, deployer));
    }

    function test_RegistrarRoleConstantMatchesExpected() public view {
        assertEq(registry.REGISTRAR_ROLE(), keccak256("REGISTRAR_ROLE"));
    }

    function test_StrangerHasNoRoles() public view {
        assertFalse(registry.hasRole(DEFAULT_ADMIN_ROLE, stranger));
        assertFalse(registry.hasRole(REGISTRAR_ROLE, stranger));
    }

    // =========================================================================
    // Role management (admin grants / revokes)
    // =========================================================================

    function test_AdminCanGrantRegistrarRole() public {
        vm.prank(deployer);
        registry.grantRole(REGISTRAR_ROLE, registrar);
        assertTrue(registry.hasRole(REGISTRAR_ROLE, registrar));
    }

    function test_AdminCanRevokeRegistrarRole() public {
        vm.prank(deployer);
        registry.grantRole(REGISTRAR_ROLE, registrar);

        vm.prank(deployer);
        registry.revokeRole(REGISTRAR_ROLE, registrar);

        assertFalse(registry.hasRole(REGISTRAR_ROLE, registrar));
    }

    function test_NonAdminCannotGrantRegistrarRole() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                DEFAULT_ADMIN_ROLE
            )
        );
        vm.prank(stranger);
        registry.grantRole(REGISTRAR_ROLE, stranger);
    }

    // =========================================================================
    // Access Control on submit()
    // =========================================================================

    function test_RevertWhen_SubmitCalledByStranger() public {
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                stranger,
                REGISTRAR_ROLE
            )
        );
        vm.prank(stranger);
        registry.submit(HASH_A, CAT_A);
    }

    function test_RevertWhen_SubmitCalledAfterRoleRevoked() public {
        // Grant then revoke
        vm.prank(deployer);
        registry.grantRole(REGISTRAR_ROLE, registrar);
        vm.prank(deployer);
        registry.revokeRole(REGISTRAR_ROLE, registrar);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                registrar,
                REGISTRAR_ROLE
            )
        );
        vm.prank(registrar);
        registry.submit(HASH_A, CAT_A);
    }

    function test_SubmitSucceedsForDeployer() public {
        vm.prank(deployer);
        uint256 id = registry.submit(HASH_A, CAT_A);
        assertEq(id, 0);
    }

    function test_SubmitSucceedsForGrantedRegistrar() public {
        vm.prank(deployer);
        registry.grantRole(REGISTRAR_ROLE, registrar);

        vm.prank(registrar);
        uint256 id = registry.submit(HASH_A, CAT_A);
        assertEq(id, 0);
    }

    // =========================================================================
    // Input validation
    // =========================================================================

    function test_RevertWhen_HashIsZero() public {
        vm.expectRevert(EvidenceRegistry.InvalidHash.selector);
        vm.prank(deployer);
        registry.submit(bytes32(0), CAT_A);
    }

    function test_RevertWhen_CategoryIsEmpty() public {
        vm.expectRevert(EvidenceRegistry.InvalidCategory.selector);
        vm.prank(deployer);
        registry.submit(HASH_A, "");
    }

    // =========================================================================
    // Duplicate prevention
    // =========================================================================

    function test_RevertWhen_DuplicateHashSubmitted() public {
        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);

        vm.expectRevert(
            abi.encodeWithSelector(EvidenceRegistry.DuplicateEvidence.selector, HASH_A)
        );
        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);
    }

    function test_RevertWhen_DuplicateHashFromDifferentRegistrar() public {
        vm.prank(deployer);
        registry.grantRole(REGISTRAR_ROLE, registrar);

        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);

        // Different caller, same hash — must still revert
        vm.expectRevert(
            abi.encodeWithSelector(EvidenceRegistry.DuplicateEvidence.selector, HASH_A)
        );
        vm.prank(registrar);
        registry.submit(HASH_A, CAT_B);
    }

    function test_DifferentHashesAreAccepted() public {
        vm.startPrank(deployer);
        uint256 idA = registry.submit(HASH_A, CAT_A);
        uint256 idB = registry.submit(HASH_B, CAT_B);
        vm.stopPrank();

        assertEq(idA, 0);
        assertEq(idB, 1);
    }

    // =========================================================================
    // Event emission
    // =========================================================================

    function test_EmitsEvidenceSubmittedEvent() public {
        vm.expectEmit(true, true, false, true);
        emit EvidenceRegistry.EvidenceSubmitted(HASH_A, deployer, block.timestamp, CAT_A, 0);

        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);
    }

    // =========================================================================
    // getEvidence()
    // =========================================================================

    function test_GetEvidenceReturnsCorrectStruct() public {
        uint256 ts = 1_700_000_000;
        vm.warp(ts);

        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);

        EvidenceRegistry.Evidence memory ev = registry.getEvidence(0);
        assertEq(ev.fileHash,  HASH_A);
        assertEq(ev.submitter, deployer);
        assertEq(ev.timestamp, ts);
        assertEq(ev.category,  CAT_A);
    }

    function test_RevertWhen_GetEvidenceIdOutOfRange() public {
        vm.expectRevert(
            abi.encodeWithSelector(EvidenceRegistry.EvidenceNotFound.selector, 0)
        );
        registry.getEvidence(0);
    }

    function test_GetEvidenceAfterMultipleSubmissions() public {
        vm.startPrank(deployer);
        registry.submit(HASH_A, CAT_A);
        registry.submit(HASH_B, CAT_B);
        vm.stopPrank();

        EvidenceRegistry.Evidence memory ev = registry.getEvidence(1);
        assertEq(ev.fileHash, HASH_B);
        assertEq(ev.category, CAT_B);
    }

    // =========================================================================
    // isRegistered()
    // =========================================================================

    function test_IsRegistered_ReturnsFalseForUnknownHash() public view {
        (bool registered, uint256 id) = registry.isRegistered(HASH_A);
        assertFalse(registered);
        assertEq(id, 0);
    }

    function test_IsRegistered_ReturnsTrueAfterSubmission() public {
        vm.prank(deployer);
        registry.submit(HASH_A, CAT_A);

        (bool registered, uint256 id) = registry.isRegistered(HASH_A);
        assertTrue(registered);
        assertEq(id, 0);
    }

    function test_IsRegistered_ReturnsCorrectIdForSecondEntry() public {
        vm.startPrank(deployer);
        registry.submit(HASH_A, CAT_A);
        registry.submit(HASH_B, CAT_B);
        vm.stopPrank();

        (bool registered, uint256 id) = registry.isRegistered(HASH_B);
        assertTrue(registered);
        assertEq(id, 1);
    }

    // =========================================================================
    // totalEvidence()
    // =========================================================================

    function test_TotalEvidenceStartsAtZero() public view {
        assertEq(registry.totalEvidence(), 0);
    }

    function test_TotalEvidenceIncrementsOnEachSubmission() public {
        vm.startPrank(deployer);
        assertEq(registry.totalEvidence(), 0);
        registry.submit(HASH_A, CAT_A);
        assertEq(registry.totalEvidence(), 1);
        registry.submit(HASH_B, CAT_B);
        assertEq(registry.totalEvidence(), 2);
        vm.stopPrank();
    }

    // =========================================================================
    // Fuzz tests
    // =========================================================================

    /// @dev Any non-zero hash with a non-empty category submitted by the deployer
    ///      must succeed exactly once and be retrievable.
    function testFuzz_SubmitAndRetrieve(bytes32 fileHash, string calldata category) public {
        vm.assume(fileHash != bytes32(0));
        vm.assume(bytes(category).length > 0);

        vm.prank(deployer);
        uint256 id = registry.submit(fileHash, category);

        EvidenceRegistry.Evidence memory ev = registry.getEvidence(id);
        assertEq(ev.fileHash, fileHash);
        assertEq(ev.category, category);
        assertEq(ev.submitter, deployer);

        (bool registered, uint256 queriedId) = registry.isRegistered(fileHash);
        assertTrue(registered);
        assertEq(queriedId, id);
    }

    /// @dev Submitting the same non-zero hash twice must always revert with DuplicateEvidence.
    function testFuzz_DuplicateAlwaysReverts(bytes32 fileHash, string calldata category) public {
        vm.assume(fileHash != bytes32(0));
        vm.assume(bytes(category).length > 0);

        vm.prank(deployer);
        registry.submit(fileHash, category);

        vm.expectRevert(
            abi.encodeWithSelector(EvidenceRegistry.DuplicateEvidence.selector, fileHash)
        );
        vm.prank(deployer);
        registry.submit(fileHash, category);
    }

    /// @dev Any address without REGISTRAR_ROLE must be rejected.
    function testFuzz_UnauthorizedCallerAlwaysReverts(address caller) public {
        vm.assume(caller != deployer);
        vm.assume(caller != address(0));

        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector,
                caller,
                REGISTRAR_ROLE
            )
        );
        vm.prank(caller);
        registry.submit(HASH_A, CAT_A);
    }
}
