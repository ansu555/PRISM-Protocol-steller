# Contract Reference (`prism_core`)

## 1. Files

- Entrypoints: `soroban/prism-core/src/lib.rs`
- Storage keys: `soroban/prism-core/src/storage.rs`
- Types: `soroban/prism-core/src/state.rs`
- Errors: `soroban/prism-core/src/errors.rs`
- Math: `soroban/prism-core/src/math.rs`

## 2. Entrypoint Groups

### Initialization

- `init_config(admin, usdc_token, default_yield_rate_bps, oracle_allowlist)`
- `init_vault(vault_id)`
- `init_tranche(vault_id, kind, target_apy_bps, ptoken)`

### Read-only getters

- `get_config()`
- `get_vault(vault_id)`
- `get_tranche(vault_id, kind)`
- `get_loan(loan_id)`
- `get_collateral(loan_id)`
- `get_encrypt_health(loan_id)`
- `get_cloak_payout(vault_id, seq)`
- `get_loss_bucket_balance(vault_id)`

### Admin lifecycle

- `pause()`
- `unpause()`
- `add_oracle_to_allowlist(oracle_pubkey)`
- `remove_oracle_from_allowlist(oracle_pubkey)`
- `rotate_oracle_allowlist_key(old_oracle_pubkey, new_oracle_pubkey)`
- `is_oracle_allowlisted(oracle_pubkey)`

### Capital flows

- `deposit(user, vault_id, kind, amount)`
- `withdraw(user, vault_id, kind, shares)`
- `accrue_yield(authority, vault_id, payer, amount)`
- `trigger_credit_event(authority, vault_id, event_type, loss_amount, severity_bps, loan_id)`

### Loan lifecycle

- `init_loan(vault_id, loan_id, borrower, principal, apr_bps, maturity_ts)`
- `disburse_loan(vault_id, loan_id)`
- `repay_loan(borrower, loan_id, amount)`

### Oracle lifecycle

- Encrypt:
  - `attach_encrypt_score(borrower, loan_id, commitment, encrypt_oracle)`
  - `verify_encrypt_default(relayer, vault_id, loan_id, message, signature, loss_amount, severity_bps)`
- Collateral:
  - `attach_collateral(borrower, loan_id, oracle_pubkey)`
  - `verify_collateral(relayer, loan_id, message, signature)`
  - `release_collateral(borrower, loan_id, message, signature)`
  - `liquidate_collateral(admin, loan_id, message, signature, loss_amount, severity_bps)`
- Cloak:
  - `record_cloak_payout(relayer, vault_id, cloak_oracle, message, signature, total_shielded_amount)`

### External composition

- `seed_pool_liquidity(admin, vault_id, kind, soroswap_router, usdc_amount, ptoken_amount, usdc_min, ptoken_min)`
- `read_reflector_price(reflector, asset_symbol)`

## 3. Storage Keys

Defined in `DataKey`:

- `Config`
- `Vault(vault_id)`
- `Tranche(vault_id, kind)`
- `Loan(loan_id)`
- `CreditEvent(vault_id, seq)`
- `EncryptHealth(loan_id)`
- `CloakPayout(vault_id, seq)`
- `LossBucketBalance(vault_id)`
- `NextLoanId`
- `NextCloakSeq(vault_id)`
- `Collateral(loan_id)`

## 4. Error Families

- lifecycle/auth: paused, unauthorized, wrong state
- math: overflow, invalid severity, invalid tranche kind
- credit risk: loss larger than available assets
- oracle: signature/commitment/allowlist/replay failures
- setup: already initialized / not initialized

See full list in `soroban/prism-core/src/errors.rs`.

## 5. Invariants To Preserve

1. Tranche ordering for waterfall and cascade must remain deterministic.
2. NAV updates must happen after any `total_assets` / `total_supply` mutation.
3. Loss bucket accounting must track every cascade write-down.
4. Collateral nonce progression must be strictly increasing.
5. Oracle pubkeys must remain allowlisted for protected handlers.
