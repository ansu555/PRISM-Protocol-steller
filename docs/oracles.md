# Oracle Flows

PRISM currently has three oracle attestation paths:

- collateral oracle
- Encrypt default oracle
- Cloak payout oracle

All are verified on-chain with Ed25519 signature checks.

## 1. Collateral Oracle

### Route

- `app/api/collateral-oracle/attest/route.ts`

### Contract handlers

- `attach_collateral`
- `verify_collateral`
- `release_collateral`
- `liquidate_collateral`

### Message format (73 bytes)

- `0..8`: `col_atts`
- `8..12`: `loan_id` (u32 LE)
- `12..16`: `chain_id` (u32 LE)
- `16..48`: `asset_address` (32 bytes)
- `48..56`: `amount_usd_micro` (u64 LE)
- `56..64`: `valued_at_ts` (i64 LE)
- `64..72`: `nonce` (u64 LE)
- `72`: status byte

Status bytes:

- `0x01` = attached
- `0x02` = released
- `0x03` = liquidated

### Replay control

`parse_and_verify_collateral_message` enforces `nonce > last_nonce`.

## 2. Encrypt Default Oracle

### Route

- `app/api/encrypt-oracle/attest_default/route.ts`

### Contract handlers

- `attach_encrypt_score`
- `verify_encrypt_default`

### Message format (73 bytes)

- `0..8`: `enc_atts`
- `8..40`: loan id padded to 32 bytes (`u32 LE + zero padding`)
- `40..72`: score commitment (32 bytes)
- `72`: default result byte (`0x01` = default proven)

On valid proof, contract marks loan health as default-proven and applies default cascade.

## 3. Cloak Payout Oracle

### Route

- `app/api/cloak-oracle/attest/route.ts`

### Contract handler

- `record_cloak_payout`

### Message format (73 bytes)

- `0..8`: `clk_atts`
- `8..40`: vault id padded to 32 bytes (`u32 LE + zero padding`)
- `40..72`: batch id (32 bytes)
- `72`: confirmation byte (`0x01` expected)

This records payout attestation metadata on-chain.

## 4. Operational Rules

1. Keep API route message builders and contract parsers byte-identical.
2. Keep oracle pubkeys in contract allowlist before first use.
3. Use managed signer env vars only; deterministic hardcoded fallback keys are no longer accepted.
4. Routes expose `key_id` in responses to support controlled cutover during key rotation.
5. Oracle endpoints enforce request throttling and return:
   - `x-ratelimit-limit`
   - `x-ratelimit-remaining`
   - `x-ratelimit-reset`
6. Treat all signer seeds as secrets, never client-visible variables.

## 5. Managed Key Rotation

Each route supports:

- primary key seed (`*_SEED`)
- optional next key seed (`*_SEED_NEXT`)
- active key selector (`*_ACTIVE_KEY_ID`)
- explicit key identifiers (`*_PRIMARY_KEY_ID`, `*_NEXT_KEY_ID`)

Rotation flow:

1. Add new oracle pubkey on-chain with `add_oracle_to_allowlist`.
2. Set `*_SEED_NEXT` and `*_NEXT_KEY_ID`.
3. Validate signatures by passing `key_id=<next_key_id>` to the route.
4. Flip `*_ACTIVE_KEY_ID` to the next key id.
5. Revoke old pubkey on-chain with `remove_oracle_from_allowlist` once cutover is complete.

## 6. Observability

Oracle routes emit operational events into `protocol_events` with event types:

- `OracleAttestationSigned`
- `OracleRateLimitBlocked`
- `OracleAttestationRejected`
- `OracleAttestationError`
