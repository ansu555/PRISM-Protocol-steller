// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title  PrismCollateralVault
/// @notice Escrow contract for PRISM Protocol cross-chain collateral locking.
///
///         Borrowers lock ETH or whitelisted ERC-20 tokens here. The PRISM
///         Collateral Oracle watches for CollateralLocked events and attests
///         on Stellar Soroban (attach_collateral → verify_collateral), which
///         unblocks disburse_loan.
///
///         On repayment: admin calls release() — collateral returns to borrower.
///         On default:   admin calls liquidate() — collateral goes to treasury.
///
///         Admin MUST be a Gnosis Safe (2-of-3). No upgradability — immutable.
contract PrismCollateralVault is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────────

    enum LockState {
        Empty,      // slot never used
        Locked,     // collateral held, loan active
        Released,   // borrower repaid, collateral returned
        Liquidated  // borrower defaulted, collateral sent to treasury
    }

    struct CollateralLock {
        address  borrower;
        address  token;          // address(0) = native ETH
        uint256  amount;
        uint32   stellarLoanId;
        LockState state;
        uint256  lockedAt;
        string   stellarBorrower; // G-address, stored for oracle reference
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public immutable admin;

    mapping(uint32 => CollateralLock) private _locks;
    mapping(address => bool)          public  acceptedTokens;

    // ─── Events ───────────────────────────────────────────────────────────────

    event CollateralLocked(
        uint32  indexed stellarLoanId,
        address indexed borrower,
        address indexed token,
        uint256         amount,
        string          stellarBorrower,
        uint256         lockedAt
    );

    event CollateralReleased(
        uint32  indexed stellarLoanId,
        address indexed borrower,
        address         token,
        uint256         amount
    );

    event CollateralLiquidated(
        uint32  indexed stellarLoanId,
        address indexed to,
        address         token,
        uint256         amount
    );

    event TokenAdded(address indexed token);
    event TokenRemoved(address indexed token);

    // ─── Errors ───────────────────────────────────────────────────────────────

    error NotAdmin();
    error TokenNotAccepted(address token);
    error LoanAlreadyExists(uint32 stellarLoanId);
    error LoanNotLocked(uint32 stellarLoanId);
    error ZeroAmount();
    error ETHTransferFailed();
    error InvalidAddress();

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /// @param _admin         Gnosis Safe 2-of-3 address — only address that can
    ///                       release or liquidate collateral.
    /// @param _initialTokens ERC-20 addresses to whitelist at deploy time.
    ///                       Pass an empty array to add tokens later via addToken().
    constructor(address _admin, address[] memory _initialTokens) {
        if (_admin == address(0)) revert InvalidAddress();
        admin = _admin;

        for (uint256 i = 0; i < _initialTokens.length; i++) {
            if (_initialTokens[i] != address(0)) {
                acceptedTokens[_initialTokens[i]] = true;
                emit TokenAdded(_initialTokens[i]);
            }
        }
        // Native ETH (address(0)) is always accepted — no whitelist entry needed.
    }

    // ─── Borrower: Lock ERC-20 ────────────────────────────────────────────────

    /// @notice Lock an ERC-20 token as collateral for a PRISM Stellar loan.
    /// @param stellarLoanId  Sequential on-chain loan ID from prism-core (0, 1, 2…).
    /// @param token          Whitelisted ERC-20 contract address.
    /// @param amount         Amount in the token's native decimals.
    /// @param stellarBorrower The borrower's Stellar G-address (stored for the oracle).
    function lock(
        uint32  stellarLoanId,
        address token,
        uint256 amount,
        string  calldata stellarBorrower
    ) external nonReentrant whenNotPaused {
        if (!acceptedTokens[token])                         revert TokenNotAccepted(token);
        if (amount == 0)                                    revert ZeroAmount();
        if (_locks[stellarLoanId].state != LockState.Empty) revert LoanAlreadyExists(stellarLoanId);

        // Effects before interactions (CEI)
        _locks[stellarLoanId] = CollateralLock({
            borrower:       msg.sender,
            token:          token,
            amount:         amount,
            stellarLoanId:  stellarLoanId,
            state:          LockState.Locked,
            lockedAt:       block.timestamp,
            stellarBorrower: stellarBorrower
        });

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        emit CollateralLocked(
            stellarLoanId,
            msg.sender,
            token,
            amount,
            stellarBorrower,
            block.timestamp
        );
    }

    /// @notice Lock native ETH as collateral for a PRISM Stellar loan.
    function lockETH(
        uint32 stellarLoanId,
        string calldata stellarBorrower
    ) external payable nonReentrant whenNotPaused {
        if (msg.value == 0)                                  revert ZeroAmount();
        if (_locks[stellarLoanId].state != LockState.Empty)  revert LoanAlreadyExists(stellarLoanId);

        _locks[stellarLoanId] = CollateralLock({
            borrower:       msg.sender,
            token:          address(0),
            amount:         msg.value,
            stellarLoanId:  stellarLoanId,
            state:          LockState.Locked,
            lockedAt:       block.timestamp,
            stellarBorrower: stellarBorrower
        });

        emit CollateralLocked(
            stellarLoanId,
            msg.sender,
            address(0),
            msg.value,
            stellarBorrower,
            block.timestamp
        );
    }

    // ─── Admin: Release (loan repaid) ─────────────────────────────────────────

    /// @notice Return collateral to the borrower after full repayment on Stellar.
    ///         Called by the Gnosis Safe after the oracle attests repayment.
    function release(uint32 stellarLoanId) external onlyAdmin nonReentrant {
        CollateralLock storage lock_ = _locks[stellarLoanId];
        if (lock_.state != LockState.Locked) revert LoanNotLocked(stellarLoanId);

        address borrower = lock_.borrower;
        address token    = lock_.token;
        uint256 amount   = lock_.amount;

        // Effects before interactions
        lock_.state = LockState.Released;

        _transferOut(token, borrower, amount);
        emit CollateralReleased(stellarLoanId, borrower, token, amount);
    }

    // ─── Admin: Liquidate (loan defaulted) ────────────────────────────────────

    /// @notice Send collateral to the PRISM treasury on borrower default.
    ///         Requires 2-of-3 Safe signers. `to` should be the PRISM treasury
    ///         multisig, not a single EOA.
    /// @param to  Destination address for the collateral (treasury or auction contract).
    function liquidate(uint32 stellarLoanId, address to) external onlyAdmin nonReentrant {
        if (to == address(0)) revert InvalidAddress();

        CollateralLock storage lock_ = _locks[stellarLoanId];
        if (lock_.state != LockState.Locked) revert LoanNotLocked(stellarLoanId);

        address token  = lock_.token;
        uint256 amount = lock_.amount;

        lock_.state = LockState.Liquidated;

        _transferOut(token, to, amount);
        emit CollateralLiquidated(stellarLoanId, to, token, amount);
    }

    // ─── Admin: Token whitelist ────────────────────────────────────────────────

    function addToken(address token) external onlyAdmin {
        if (token == address(0)) revert InvalidAddress();
        acceptedTokens[token] = true;
        emit TokenAdded(token);
    }

    function removeToken(address token) external onlyAdmin {
        acceptedTokens[token] = false;
        emit TokenRemoved(token);
    }

    // ─── Admin: Emergency pause ────────────────────────────────────────────────

    function pause()   external onlyAdmin { _pause(); }
    function unpause() external onlyAdmin { _unpause(); }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getLock(uint32 stellarLoanId) external view returns (CollateralLock memory) {
        return _locks[stellarLoanId];
    }

    function isTokenAccepted(address token) external view returns (bool) {
        if (token == address(0)) return true; // ETH always accepted
        return acceptedTokens[token];
    }

    // ─── Internal ─────────────────────────────────────────────────────────────

    function _transferOut(address token, address to, uint256 amount) internal {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert ETHTransferFailed();
        } else {
            IERC20(token).safeTransfer(to, amount);
        }
    }

    /// @dev Reject accidental ETH sends that bypass lockETH().
    receive() external payable {
        revert("Use lockETH()");
    }
}
