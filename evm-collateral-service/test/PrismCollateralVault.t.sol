// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PrismCollateralVault.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Minimal ERC-20 mock for testing
contract MockERC20 is ERC20 {
    uint8 private _dec;
    constructor(string memory name, string memory symbol, uint8 dec) ERC20(name, symbol) {
        _dec = dec;
    }
    function decimals() public view override returns (uint8) { return _dec; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
}

contract PrismCollateralVaultTest is Test {
    PrismCollateralVault vault;
    MockERC20            usdc;
    MockERC20            wbtc;

    address admin    = makeAddr("admin");    // simulates Gnosis Safe
    address borrower = makeAddr("borrower");
    address treasury = makeAddr("treasury");

    uint32 constant LOAN_ID = 42;
    string constant STELLAR_ADDR = "GBORROWER123456789012345678901234567890123456789012";

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        wbtc = new MockERC20("Wrapped Bitcoin", "WBTC", 8);

        address[] memory tokens = new address[](2);
        tokens[0] = address(usdc);
        tokens[1] = address(wbtc);

        vault = new PrismCollateralVault(admin, tokens);

        // Fund borrower
        usdc.mint(borrower, 100_000e6);
        deal(borrower, 10 ether);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_admin_set_correctly() public view {
        assertEq(vault.admin(), admin);
    }

    function test_initial_tokens_whitelisted() public view {
        assertTrue(vault.acceptedTokens(address(usdc)));
        assertTrue(vault.acceptedTokens(address(wbtc)));
    }

    function test_eth_always_accepted() public view {
        assertTrue(vault.isTokenAccepted(address(0)));
    }

    function test_revert_zero_admin() public {
        address[] memory empty = new address[](0);
        vm.expectRevert(PrismCollateralVault.InvalidAddress.selector);
        new PrismCollateralVault(address(0), empty);
    }

    // ─── lock() ERC-20 ────────────────────────────────────────────────────────

    function test_lock_usdc() public {
        uint256 amount = 5_000e6;

        vm.startPrank(borrower);
        usdc.approve(address(vault), amount);

        vm.expectEmit(true, true, true, true);
        emit PrismCollateralVault.CollateralLocked(
            LOAN_ID, borrower, address(usdc), amount, STELLAR_ADDR, block.timestamp
        );

        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);
        vm.stopPrank();

        PrismCollateralVault.CollateralLock memory rec = vault.getLock(LOAN_ID);
        assertEq(rec.borrower, borrower);
        assertEq(rec.token, address(usdc));
        assertEq(rec.amount, amount);
        assertEq(uint8(rec.state), uint8(PrismCollateralVault.LockState.Locked));
        assertEq(usdc.balanceOf(address(vault)), amount);
    }

    function test_revert_lock_unaccepted_token() public {
        MockERC20 rando = new MockERC20("Rando", "RND", 18);
        rando.mint(borrower, 1000e18);

        vm.startPrank(borrower);
        rando.approve(address(vault), 1000e18);
        vm.expectRevert(
            abi.encodeWithSelector(PrismCollateralVault.TokenNotAccepted.selector, address(rando))
        );
        vault.lock(LOAN_ID, address(rando), 1000e18, STELLAR_ADDR);
        vm.stopPrank();
    }

    function test_revert_lock_zero_amount() public {
        vm.startPrank(borrower);
        usdc.approve(address(vault), 0);
        vm.expectRevert(PrismCollateralVault.ZeroAmount.selector);
        vault.lock(LOAN_ID, address(usdc), 0, STELLAR_ADDR);
        vm.stopPrank();
    }

    function test_revert_lock_duplicate_loan_id() public {
        uint256 amount = 1_000e6;
        vm.startPrank(borrower);
        usdc.approve(address(vault), amount * 2);
        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);

        vm.expectRevert(
            abi.encodeWithSelector(PrismCollateralVault.LoanAlreadyExists.selector, LOAN_ID)
        );
        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);
        vm.stopPrank();
    }

    // ─── lockETH() ────────────────────────────────────────────────────────────

    function test_lock_eth() public {
        uint256 amount = 1 ether;

        vm.prank(borrower);
        vault.lockETH{value: amount}(LOAN_ID, STELLAR_ADDR);

        PrismCollateralVault.CollateralLock memory rec = vault.getLock(LOAN_ID);
        assertEq(rec.token, address(0));
        assertEq(rec.amount, amount);
        assertEq(address(vault).balance, amount);
    }

    function test_revert_lockETH_zero_value() public {
        vm.prank(borrower);
        vm.expectRevert(PrismCollateralVault.ZeroAmount.selector);
        vault.lockETH{value: 0}(LOAN_ID, STELLAR_ADDR);
    }

    function test_revert_direct_eth_send() public {
        vm.prank(borrower);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // ─── release() ────────────────────────────────────────────────────────────

    function test_release_usdc() public {
        uint256 amount = 5_000e6;
        vm.startPrank(borrower);
        usdc.approve(address(vault), amount);
        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);
        vm.stopPrank();

        uint256 balBefore = usdc.balanceOf(borrower);

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit PrismCollateralVault.CollateralReleased(LOAN_ID, borrower, address(usdc), amount);
        vault.release(LOAN_ID);

        assertEq(usdc.balanceOf(borrower), balBefore + amount);
        assertEq(uint8(vault.getLock(LOAN_ID).state), uint8(PrismCollateralVault.LockState.Released));
    }

    function test_release_eth() public {
        uint256 amount = 1 ether;
        vm.prank(borrower);
        vault.lockETH{value: amount}(LOAN_ID, STELLAR_ADDR);

        uint256 balBefore = borrower.balance;
        vm.prank(admin);
        vault.release(LOAN_ID);

        assertEq(borrower.balance, balBefore + amount);
    }

    function test_revert_release_not_admin() public {
        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();

        vm.prank(borrower);
        vm.expectRevert(PrismCollateralVault.NotAdmin.selector);
        vault.release(LOAN_ID);
    }

    function test_revert_release_already_released() public {
        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();

        vm.startPrank(admin);
        vault.release(LOAN_ID);
        vm.expectRevert(
            abi.encodeWithSelector(PrismCollateralVault.LoanNotLocked.selector, LOAN_ID)
        );
        vault.release(LOAN_ID);
        vm.stopPrank();
    }

    // ─── liquidate() ──────────────────────────────────────────────────────────

    function test_liquidate_usdc() public {
        uint256 amount = 5_000e6;
        vm.startPrank(borrower);
        usdc.approve(address(vault), amount);
        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);
        vm.stopPrank();

        vm.prank(admin);
        vm.expectEmit(true, true, false, true);
        emit PrismCollateralVault.CollateralLiquidated(LOAN_ID, treasury, address(usdc), amount);
        vault.liquidate(LOAN_ID, treasury);

        assertEq(usdc.balanceOf(treasury), amount);
        assertEq(uint8(vault.getLock(LOAN_ID).state), uint8(PrismCollateralVault.LockState.Liquidated));
    }

    function test_liquidate_eth() public {
        uint256 amount = 2 ether;
        vm.prank(borrower);
        vault.lockETH{value: amount}(LOAN_ID, STELLAR_ADDR);

        uint256 balBefore = treasury.balance;
        vm.prank(admin);
        vault.liquidate(LOAN_ID, treasury);

        assertEq(treasury.balance, balBefore + amount);
    }

    function test_revert_liquidate_not_admin() public {
        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();

        vm.prank(borrower);
        vm.expectRevert(PrismCollateralVault.NotAdmin.selector);
        vault.liquidate(LOAN_ID, treasury);
    }

    function test_revert_liquidate_zero_to() public {
        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert(PrismCollateralVault.InvalidAddress.selector);
        vault.liquidate(LOAN_ID, address(0));
    }

    // ─── Token whitelist ──────────────────────────────────────────────────────

    function test_add_token() public {
        MockERC20 newToken = new MockERC20("New", "NEW", 18);
        vm.prank(admin);
        vault.addToken(address(newToken));
        assertTrue(vault.acceptedTokens(address(newToken)));
    }

    function test_remove_token() public {
        vm.prank(admin);
        vault.removeToken(address(usdc));
        assertFalse(vault.acceptedTokens(address(usdc)));
    }

    function test_revert_add_token_not_admin() public {
        vm.prank(borrower);
        vm.expectRevert(PrismCollateralVault.NotAdmin.selector);
        vault.addToken(makeAddr("someToken"));
    }

    // ─── Pause ────────────────────────────────────────────────────────────────

    function test_pause_blocks_lock() public {
        vm.prank(admin);
        vault.pause();

        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vm.expectRevert();
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();
    }

    function test_unpause_allows_lock() public {
        vm.prank(admin);
        vault.pause();

        vm.prank(admin);
        vault.unpause();

        vm.startPrank(borrower);
        usdc.approve(address(vault), 1_000e6);
        vault.lock(LOAN_ID, address(usdc), 1_000e6, STELLAR_ADDR);
        vm.stopPrank();

        assertEq(uint8(vault.getLock(LOAN_ID).state), uint8(PrismCollateralVault.LockState.Locked));
    }

    // ─── Fuzz ─────────────────────────────────────────────────────────────────

    function testFuzz_lock_and_release(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000e6);
        usdc.mint(borrower, amount);

        vm.startPrank(borrower);
        usdc.approve(address(vault), amount);
        vault.lock(LOAN_ID, address(usdc), amount, STELLAR_ADDR);
        vm.stopPrank();

        uint256 balBefore = usdc.balanceOf(borrower);
        vm.prank(admin);
        vault.release(LOAN_ID);

        assertEq(usdc.balanceOf(borrower), balBefore + amount);
    }

    function testFuzz_lock_and_liquidate(uint96 amount) public {
        vm.assume(amount > 0);
        deal(borrower, amount);

        vm.prank(borrower);
        vault.lockETH{value: amount}(LOAN_ID, STELLAR_ADDR);

        uint256 balBefore = treasury.balance;
        vm.prank(admin);
        vault.liquidate(LOAN_ID, treasury);

        assertEq(treasury.balance, balBefore + amount);
    }
}
