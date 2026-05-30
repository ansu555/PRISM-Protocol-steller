import postgres from 'postgres';

const globalForApps = globalThis as typeof globalThis & {
  appSql?: ReturnType<typeof postgres>;
  appSchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (!globalForApps.appSql) {
    globalForApps.appSql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForApps.appSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForApps.appSchemaReady) {
    globalForApps.appSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS loan_applications (
          id               text    PRIMARY KEY,
          borrower_pubkey  text    NOT NULL,
          requested_usdc   numeric NOT NULL,
          maturity_days    integer NOT NULL,
          purpose          text    NOT NULL DEFAULT '',
          status           text    NOT NULL DEFAULT 'pending',
          submitted_at     bigint  NOT NULL,
          loan_id          integer,
          vault_id         integer NOT NULL DEFAULT 0,
          approved_apr_bps integer,
          updated_at       timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_loan_apps_vault_id ON loan_applications (vault_id, submitted_at DESC)`;
    })().catch((err) => {
      globalForApps.appSchemaReady = undefined;
      throw err;
    });
  }
  await globalForApps.appSchemaReady;
}

export type LoanApplicationRow = {
  id: string;
  borrower_pubkey: string;
  requested_usdc: string;
  maturity_days: number;
  purpose: string;
  status: string;
  submitted_at: string;
  loan_id: number | null;
  vault_id: number;
  approved_apr_bps: number | null;
};

export async function listApplications(vaultId: number): Promise<LoanApplicationRow[]> {
  const sql = getSql();
  await ensureTable(sql);
  return sql<LoanApplicationRow[]>`
    SELECT id, borrower_pubkey, requested_usdc, maturity_days, purpose,
           status, submitted_at, loan_id, vault_id, approved_apr_bps
    FROM loan_applications
    WHERE vault_id = ${vaultId}
    ORDER BY submitted_at DESC
  `;
}

export type InsertApplicationInput = {
  id: string;
  borrowerPubkey: string;
  requestedUsdc: number;
  maturityDays: number;
  purpose: string;
  vaultId: number;
  submittedAt: number;
};

export async function insertApplication(input: InsertApplicationInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO loan_applications
      (id, borrower_pubkey, requested_usdc, maturity_days, purpose, vault_id, submitted_at, status)
    VALUES
      (${input.id}, ${input.borrowerPubkey}, ${input.requestedUsdc}, ${input.maturityDays},
       ${input.purpose}, ${input.vaultId}, ${input.submittedAt}, 'pending')
    ON CONFLICT (id) DO NOTHING
  `;
}

export type PatchApplicationInput = {
  status: 'pending' | 'approved' | 'rejected';
  loanId?: number;
  approvedAprBps?: number;
};

export async function patchApplication(id: string, patch: PatchApplicationInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    UPDATE loan_applications SET
      status           = ${patch.status},
      loan_id          = ${patch.loanId ?? null},
      approved_apr_bps = ${patch.approvedAprBps ?? null},
      updated_at       = now()
    WHERE id = ${id}
  `;
}
