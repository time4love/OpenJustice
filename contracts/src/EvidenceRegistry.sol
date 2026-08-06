// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title EvidenceRegistry
/// @notice Immutable, on-chain registry for crowdsourced legal evidence hashes.
///         Each submission records a SHA-256 file hash, a category label, a
///         Unix timestamp, and the submitter address.  Duplicate submissions
///         (same hash) are rejected at the protocol level so that evidence
///         provenance is unambiguous.
///         Only accounts holding REGISTRAR_ROLE may submit evidence — ensuring
///         that only the authorised AI Backend can write to the registry.
contract EvidenceRegistry is AccessControl {
    // -------------------------------------------------------------------------
    // Roles
    // -------------------------------------------------------------------------

    /// @notice Role required to call `submit`. Granted to the AI Backend wallet.
    bytes32 public constant REGISTRAR_ROLE = keccak256("REGISTRAR_ROLE");

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice A single piece of registered evidence.
    /// @param fileHash   SHA-256 hash of the raw evidence file (bytes32).
    /// @param submitter  EOA or contract that submitted the evidence.
    /// @param timestamp  Block timestamp at the time of submission.
    /// @param category   Human-readable category string (e.g. "side-effect-data").
    struct Evidence {
        bytes32 fileHash;
        address submitter;
        uint256 timestamp;
        string  category;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    /// @dev Sequential list of all registered evidence records.
    Evidence[] private _evidence;

    /// @dev fileHash → index+1 in _evidence (0 means not registered).
    ///      Using index+1 allows zero to serve as the sentinel "not found" value.
    mapping(bytes32 => uint256) private _hashIndex;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    /// @notice Emitted when new evidence is successfully registered.
    event EvidenceSubmitted(
        bytes32 indexed fileHash,
        address indexed submitter,
        uint256 timestamp,
        string  category,
        uint256 evidenceId
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    /// @notice Reverted when the caller tries to register a hash that already exists.
    error DuplicateEvidence(bytes32 fileHash);

    /// @notice Reverted when an empty hash (bytes32(0)) is supplied.
    error InvalidHash();

    /// @notice Reverted when an empty category string is supplied.
    error InvalidCategory();

    /// @notice Reverted when querying an evidenceId that does not exist.
    error EvidenceNotFound(uint256 evidenceId);

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @notice Grants DEFAULT_ADMIN_ROLE and REGISTRAR_ROLE to the deployer.
    ///         The admin can later grant/revoke REGISTRAR_ROLE to other addresses
    ///         (e.g., rotating the AI Backend wallet) without redeploying.
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(REGISTRAR_ROLE, msg.sender);
    }

    // -------------------------------------------------------------------------
    // External functions
    // -------------------------------------------------------------------------

    /// @notice Register a new piece of evidence on-chain.
    /// @dev    Caller must hold REGISTRAR_ROLE; reverts otherwise.
    /// @param fileHash  SHA-256 hash of the evidence file, computed off-chain.
    /// @param category  Non-empty string categorising the evidence type.
    /// @return evidenceId  Zero-based index of the newly created record.
    function submit(bytes32 fileHash, string calldata category)
        external
        onlyRole(REGISTRAR_ROLE)
        returns (uint256 evidenceId)
    {
        if (fileHash == bytes32(0)) revert InvalidHash();
        if (bytes(category).length == 0) revert InvalidCategory();
        if (_hashIndex[fileHash] != 0) revert DuplicateEvidence(fileHash);

        evidenceId = _evidence.length;

        _evidence.push(Evidence({
            fileHash:  fileHash,
            submitter: msg.sender,
            timestamp: block.timestamp,
            category:  category
        }));

        // Store index+1 so that 0 reliably means "not registered".
        _hashIndex[fileHash] = evidenceId + 1;

        emit EvidenceSubmitted(fileHash, msg.sender, block.timestamp, category, evidenceId);
    }

    // -------------------------------------------------------------------------
    // View functions
    // -------------------------------------------------------------------------

    /// @notice Retrieve a single evidence record by its sequential ID.
    /// @param evidenceId  Zero-based index returned by `submit`.
    function getEvidence(uint256 evidenceId)
        external
        view
        returns (Evidence memory)
    {
        if (evidenceId >= _evidence.length) revert EvidenceNotFound(evidenceId);
        return _evidence[evidenceId];
    }

    /// @notice Check whether a given hash has already been registered.
    /// @param fileHash  The SHA-256 hash to query.
    /// @return registered  True if the hash exists in the registry.
    /// @return evidenceId  The record's sequential ID (0 if not registered).
    function isRegistered(bytes32 fileHash)
        external
        view
        returns (bool registered, uint256 evidenceId)
    {
        uint256 storedIndex = _hashIndex[fileHash];
        if (storedIndex == 0) {
            return (false, 0);
        }
        return (true, storedIndex - 1);
    }

    /// @notice Total number of evidence records stored.
    function totalEvidence() external view returns (uint256) {
        return _evidence.length;
    }
}
