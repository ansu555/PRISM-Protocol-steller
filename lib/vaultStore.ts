import postgres from 'postgres';

class VaultDatabaseConfigError extends Error {
  constructor() {
    super('DATABASE_URL is not configured.');
    this.name = 'VaultDatabaseConfigError';
  }
}

const globalForVault = globalThis as typeof globalThis & {
  vaultSql?: ReturnType<typeof postgres>;
  vaultSchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new VaultDatabaseConfigError();

  if (!globalForVault.vaultSql) {
    globalForVault.vaultSql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForVault.vaultSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForVault.vaultSchemaReady) {
    globalForVault.vaultSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS vault_names (
          vault_id integer PRIMARY KEY,
          name     text    NOT NULL,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
    })().catch((err) => {
      globalForVault.vaultSchemaReady = undefined;
      throw err;
    });
  }
  await globalForVault.vaultSchemaReady;
}

export async function getVaultName(vaultId: number): Promise<string | null> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<{ name: string }[]>`
    SELECT name FROM vault_names WHERE vault_id = ${vaultId} LIMIT 1
  `;
  return rows[0]?.name ?? null;
}

export async function setVaultName(vaultId: number, name: string): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO vault_names (vault_id, name)
    VALUES (${vaultId}, ${name})
    ON CONFLICT (vault_id) DO UPDATE SET name = ${name}, updated_at = now()
  `;
}
