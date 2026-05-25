import postgres from 'postgres';

const globalForLoans = globalThis as typeof globalThis & {
  loanSql?: ReturnType<typeof postgres>;
  loanSchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (!globalForLoans.loanSql) {
    globalForLoans.loanSql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForLoans.loanSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForLoans.loanSchemaReady) {
    globalForLoans.loanSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS loans (
          loan_id         integer NOT NULL,
          vault_id        integer NOT NULL,
          pda             text    NOT NULL,
          borrower        text    NOT NULL,
          principal       bigint  NOT NULL,
          apr_bps         integer NOT NULL,
          origination_ts  bigint  NOT NULL,
          maturity_ts     bigint  NOT NULL,
          state           text    NOT NULL DEFAULT 'Originated',
          total_repaid    bigint  NOT NULL DEFAULT 0,
          updated_at      timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (loan_id, vault_id)
        )
      `;
    })().catch((err) => {
      globalForLoans.loanSchemaReady = undefined;
      throw err;
    });
  }
  await globalForLoans.loanSchemaReady;
}

export type LoanRow = {
  loan_id: number;
  vault_id: number;
  pda: string;
  borrower: string;
  principal: string;
  apr_bps: number;
  origination_ts: string;
  maturity_ts: string;
  state: string;
  total_repaid: string;
};

export async function listLoans(vaultId: number): Promise<LoanRow[]> {
  const sql = getSql();
  await ensureTable(sql);
  return sql<LoanRow[]>`
    SELECT loan_id, vault_id, pda, borrower, principal, apr_bps,
           origination_ts, maturity_ts, state, total_repaid
    FROM loans
    WHERE vault_id = ${vaultId}
    ORDER BY loan_id ASC
  `;
}

export type UpsertLoanInput = {
  loanId: number;
  vaultId: number;
  pda: string;
  borrower: string;
  principal: bigint;
  aprBps: number;
  originationTs: number;
  maturityTs: number;
  state: string;
  totalRepaid: bigint;
};

export async function upsertLoan(input: UpsertLoanInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO loans
      (loan_id, vault_id, pda, borrower, principal, apr_bps, origination_ts, maturity_ts, state, total_repaid)
    VALUES
      (${input.loanId}, ${input.vaultId}, ${input.pda}, ${input.borrower},
       ${input.principal.toString()}, ${input.aprBps},
       ${input.originationTs}, ${input.maturityTs}, ${input.state}, ${input.totalRepaid.toString()})
    ON CONFLICT (loan_id, vault_id) DO UPDATE SET
      pda           = EXCLUDED.pda,
      borrower      = EXCLUDED.borrower,
      principal     = EXCLUDED.principal,
      apr_bps       = EXCLUDED.apr_bps,
      origination_ts = EXCLUDED.origination_ts,
      maturity_ts   = EXCLUDED.maturity_ts,
      state         = EXCLUDED.state,
      total_repaid  = EXCLUDED.total_repaid,
      updated_at    = now()
  `;
}
