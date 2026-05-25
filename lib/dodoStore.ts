import postgres from 'postgres';

class DodoDatabaseConfigError extends Error {
  constructor() {
    super('DATABASE_URL is not configured.');
    this.name = 'DodoDatabaseConfigError';
  }
}

export type DodoIntentStatus = 'pending' | 'paid' | 'credited' | 'failed';
export type DodoIntentType = 'repayment' | 'investment';

export interface DodoIntent {
  payment_id: string;
  loan_id: number;
  borrower_pubkey: string;
  amount_usd_micro: bigint;
  status: DodoIntentStatus;
  fiat_received_at: Date | null;
  usdc_credit_sig: string | null;
  created_at: Date;
  intent_type: DodoIntentType;
  tranche_kind: number | null;
}

const SCHEMA_VERSION = 2; // bump when adding columns

const globalForDodo = globalThis as typeof globalThis & {
  dodoSql?: ReturnType<typeof postgres>;
  dodoSchemaReady?: Promise<void>;
  dodoSchemaVersion?: number;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new DodoDatabaseConfigError();

  if (!globalForDodo.dodoSql) {
    globalForDodo.dodoSql = postgres(databaseUrl, {
      max: 3,
      prepare: false,
    });
  }
  return globalForDodo.dodoSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  // Bust the cache whenever SCHEMA_VERSION is bumped so new migrations run.
  if (globalForDodo.dodoSchemaVersion !== SCHEMA_VERSION) {
    globalForDodo.dodoSchemaReady = undefined;
  }

  if (!globalForDodo.dodoSchemaReady) {
    globalForDodo.dodoSchemaReady = (async () => {
      // Base table (original columns — safe to re-run)
      await sql`
        CREATE TABLE IF NOT EXISTS dodo_intents (
          payment_id text PRIMARY KEY,
          loan_id bigint NOT NULL,
          borrower_pubkey text NOT NULL,
          amount_usd_micro bigint NOT NULL,
          status text NOT NULL DEFAULT 'pending',
          fiat_received_at timestamptz,
          usdc_credit_sig text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;
      // v2 — investment columns
      await sql`
        ALTER TABLE dodo_intents
          ADD COLUMN IF NOT EXISTS intent_type text NOT NULL DEFAULT 'repayment'
      `;
      await sql`
        ALTER TABLE dodo_intents
          ADD COLUMN IF NOT EXISTS tranche_kind int
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS dodo_intents_loan_id_idx
        ON dodo_intents (loan_id, created_at DESC)
      `;
      await sql`
        CREATE INDEX IF NOT EXISTS dodo_intents_payment_id_type_idx
        ON dodo_intents (payment_id, intent_type)
      `;
      globalForDodo.dodoSchemaVersion = SCHEMA_VERSION;
    })().catch((error) => {
      globalForDodo.dodoSchemaReady = undefined;
      throw error;
    });
  }
  await globalForDodo.dodoSchemaReady;
}

export async function recordIntent(params: {
  paymentId: string;
  loanId: number;
  borrowerPubkey: string;
  amountUsdMicro: bigint;
}) {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO dodo_intents (payment_id, loan_id, borrower_pubkey, amount_usd_micro, status, intent_type)
    VALUES (
      ${params.paymentId},
      ${params.loanId},
      ${params.borrowerPubkey},
      ${params.amountUsdMicro.toString()},
      'pending',
      'repayment'
    )
    ON CONFLICT (payment_id) DO NOTHING
  `;
}

export async function recordInvestIntent(params: {
  paymentId: string;
  trancheKind: number;
  investorPubkey: string;
  amountUsdMicro: bigint;
}) {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO dodo_intents (payment_id, loan_id, borrower_pubkey, amount_usd_micro, status, intent_type, tranche_kind)
    VALUES (
      ${params.paymentId},
      0,
      ${params.investorPubkey},
      ${params.amountUsdMicro.toString()},
      'pending',
      'investment',
      ${params.trancheKind}
    )
    ON CONFLICT (payment_id) DO NOTHING
  `;
}

/**
 * Atomic transition pending -> paid. Returns the row only if THIS call
 * was the winner; concurrent webhook retries see no row returned.
 * This is the idempotency boundary that prevents double-credit.
 */
export async function markPaidAtomic(paymentId: string): Promise<DodoIntent | null> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<DodoIntent[]>`
    UPDATE dodo_intents
       SET status = 'paid', fiat_received_at = now()
     WHERE payment_id = ${paymentId}
       AND status = 'pending'
    RETURNING *
  `;
  return rows[0] ?? null;
}

export async function markCredited(paymentId: string, txSig: string) {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    UPDATE dodo_intents
       SET status = 'credited', usdc_credit_sig = ${txSig}
     WHERE payment_id = ${paymentId}
  `;
}

export async function markFailed(paymentId: string) {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    UPDATE dodo_intents
       SET status = 'failed'
     WHERE payment_id = ${paymentId}
       AND status = 'pending'
  `;
}

/** Most recent repayment intent for a given loan id. */
export async function getIntentByLoan(loanId: number): Promise<DodoIntent | null> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<DodoIntent[]>`
    SELECT *
      FROM dodo_intents
     WHERE loan_id = ${loanId}
       AND intent_type = 'repayment'
     ORDER BY created_at DESC
     LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Investment intent by payment_id. */
export async function getIntentByPaymentId(paymentId: string): Promise<DodoIntent | null> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<DodoIntent[]>`
    SELECT * FROM dodo_intents WHERE payment_id = ${paymentId} LIMIT 1
  `;
  return rows[0] ?? null;
}

/** Cancel (mark failed) all pending/paid investment intents for an investor + tranche. */
export async function cancelInvestIntent(
  investorPubkey: string,
  trancheKind: number,
): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    UPDATE dodo_intents
       SET status = 'failed'
     WHERE borrower_pubkey = ${investorPubkey}
       AND tranche_kind    = ${trancheKind}
       AND intent_type     = 'investment'
       AND status IN ('pending', 'paid')
  `;
}

/** Most recent investment intent for a given investor + tranche. */
export async function getActiveInvestIntent(
  investorPubkey: string,
  trancheKind: number,
): Promise<DodoIntent | null> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<DodoIntent[]>`
    SELECT *
      FROM dodo_intents
     WHERE borrower_pubkey = ${investorPubkey}
       AND tranche_kind    = ${trancheKind}
       AND intent_type     = 'investment'
       AND status NOT IN ('failed')
     ORDER BY created_at DESC
     LIMIT 1
  `;
  return rows[0] ?? null;
}

export { DodoDatabaseConfigError };
