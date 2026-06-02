import postgres from 'postgres';

const globalForApps = globalThis as typeof globalThis & {
  appSql?: ReturnType<typeof postgres>;
  appSchemaReadyV2?: Promise<void>;
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
  if (!globalForApps.appSchemaReadyV2) {
    globalForApps.appSchemaReadyV2 = (async () => {
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
          network          text    NOT NULL DEFAULT 'testnet',
          updated_at       timestamptz NOT NULL DEFAULT now()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS idx_loan_apps_vault_id ON loan_applications (vault_id, submitted_at DESC)`;
      // Migrate existing rows that predate the network column
      await sql`ALTER TABLE loan_applications ADD COLUMN IF NOT EXISTS network text NOT NULL DEFAULT 'testnet'`;
      await sql`CREATE INDEX IF NOT EXISTS idx_loan_apps_network ON loan_applications (vault_id, network, submitted_at DESC)`;
    })().catch((err) => {
      globalForApps.appSchemaReadyV2 = undefined;
      throw err;
    });
  }
  await globalForApps.appSchemaReadyV2;
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
  network: string;
};

export async function listApplications(vaultId: number, network: string): Promise<LoanApplicationRow[]> {
  const sql = getSql();
  await ensureTable(sql);
  return sql<LoanApplicationRow[]>`
    SELECT id, borrower_pubkey, requested_usdc, maturity_days, purpose,
           status, submitted_at, loan_id, vault_id, approved_apr_bps, network
    FROM loan_applications
    WHERE vault_id = ${vaultId} AND network = ${network}
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
  network: string;
};

export async function insertApplication(input: InsertApplicationInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO loan_applications
      (id, borrower_pubkey, requested_usdc, maturity_days, purpose, vault_id, submitted_at, status, network)
    VALUES
      (${input.id}, ${input.borrowerPubkey}, ${input.requestedUsdc}, ${input.maturityDays},
       ${input.purpose}, ${input.vaultId}, ${input.submittedAt}, 'pending', ${input.network})
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

export async function deleteApplicationsByStatus(
  vaultId: number,
  network: string,
  status: 'pending' | 'approved' | 'rejected' | 'all',
): Promise<number> {
  const sql = getSql();
  await ensureTable(sql);
  const rows =
    status === 'all'
      ? await sql`DELETE FROM loan_applications WHERE vault_id = ${vaultId} AND network = ${network} RETURNING id`
      : await sql`DELETE FROM loan_applications WHERE vault_id = ${vaultId} AND network = ${network} AND status = ${status} RETURNING id`;
  return rows.length;
}
