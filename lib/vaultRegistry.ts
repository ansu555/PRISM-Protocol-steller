import postgres from 'postgres';

const globalForRegistry = globalThis as typeof globalThis & {
  registrySql?: ReturnType<typeof postgres>;
  registrySchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (!globalForRegistry.registrySql) {
    globalForRegistry.registrySql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForRegistry.registrySql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForRegistry.registrySchemaReady) {
    globalForRegistry.registrySchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS vault_registry (
          vault_id      integer PRIMARY KEY,
          name          text    NOT NULL,
          prime_bps     integer NOT NULL DEFAULT 500,
          core_bps      integer NOT NULL DEFAULT 800,
          alpha_bps     integer NOT NULL DEFAULT 1500,
          loan_principal bigint  NOT NULL DEFAULT 20000000000,
          maturity_days integer NOT NULL DEFAULT 365,
          created_at    timestamptz NOT NULL DEFAULT now()
        )
      `;
    })().catch((err) => {
      globalForRegistry.registrySchemaReady = undefined;
      throw err;
    });
  }
  await globalForRegistry.registrySchemaReady;
}

export type VaultRegistryRow = {
  vault_id: number;
  name: string;
  prime_bps: number;
  core_bps: number;
  alpha_bps: number;
  loan_principal: string;
  maturity_days: number;
  created_at: string;
};

export async function listRegisteredVaults(): Promise<VaultRegistryRow[]> {
  const sql = getSql();
  await ensureTable(sql);
  return sql<VaultRegistryRow[]>`
    SELECT vault_id, name, prime_bps, core_bps, alpha_bps, loan_principal, maturity_days, created_at
    FROM vault_registry
    ORDER BY vault_id ASC
  `;
}

export type RegisterVaultInput = {
  vaultId: number;
  name: string;
  primeBps: number;
  coreBps: number;
  alphaBps: number;
  loanPrincipal: bigint;
  maturityDays: number;
};

export async function registerVault(input: RegisterVaultInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO vault_registry (vault_id, name, prime_bps, core_bps, alpha_bps, loan_principal, maturity_days)
    VALUES (
      ${input.vaultId}, ${input.name}, ${input.primeBps}, ${input.coreBps},
      ${input.alphaBps}, ${input.loanPrincipal.toString()}, ${input.maturityDays}
    )
    ON CONFLICT (vault_id) DO UPDATE SET
      name          = EXCLUDED.name,
      prime_bps     = EXCLUDED.prime_bps,
      core_bps      = EXCLUDED.core_bps,
      alpha_bps     = EXCLUDED.alpha_bps,
      loan_principal = EXCLUDED.loan_principal,
      maturity_days = EXCLUDED.maturity_days
  `;
}
