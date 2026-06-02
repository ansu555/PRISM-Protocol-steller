import postgres from 'postgres';

const globalForWatcher = globalThis as typeof globalThis & {
  watcherSql?: ReturnType<typeof postgres>;
  watcherSchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (!globalForWatcher.watcherSql) {
    globalForWatcher.watcherSql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForWatcher.watcherSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForWatcher.watcherSchemaReady) {
    globalForWatcher.watcherSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS watcher_state (
          chain_id   integer     PRIMARY KEY,
          last_block bigint      NOT NULL DEFAULT 0,
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `;
    })().catch((err) => {
      globalForWatcher.watcherSchemaReady = undefined;
      throw err;
    });
  }
  await globalForWatcher.watcherSchemaReady;
}

export async function getLastBlock(chainId: number): Promise<bigint> {
  const sql = getSql();
  await ensureTable(sql);
  const rows = await sql<{ last_block: string }[]>`
    SELECT last_block FROM watcher_state WHERE chain_id = ${chainId}
  `;
  return rows[0] ? BigInt(rows[0].last_block) : 0n;
}

export async function setLastBlock(chainId: number, block: bigint): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  await sql`
    INSERT INTO watcher_state (chain_id, last_block, updated_at)
    VALUES (${chainId}, ${block.toString()}, now())
    ON CONFLICT (chain_id) DO UPDATE SET
      last_block = EXCLUDED.last_block,
      updated_at = now()
  `;
}
