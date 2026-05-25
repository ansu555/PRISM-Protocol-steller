import postgres from 'postgres';

const globalForEvents = globalThis as typeof globalThis & {
  eventSql?: ReturnType<typeof postgres>;
  eventSchemaReady?: Promise<void>;
};

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not configured.');
  if (!globalForEvents.eventSql) {
    globalForEvents.eventSql = postgres(databaseUrl, { max: 2, prepare: false });
  }
  return globalForEvents.eventSql;
}

async function ensureTable(sql: ReturnType<typeof postgres>) {
  if (!globalForEvents.eventSchemaReady) {
    globalForEvents.eventSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS protocol_events (
          id              uuid    PRIMARY KEY,
          signature       text    NOT NULL,
          event_type      text    NOT NULL,
          signer          text    NOT NULL,
          success         boolean NOT NULL DEFAULT true,
          timestamp       bigint  NOT NULL,
          message         text,
          metadata        jsonb
        )
      `;
      // Index for faster retrieval
      await sql`CREATE INDEX IF NOT EXISTS idx_protocol_events_timestamp ON protocol_events (timestamp DESC)`;
    })().catch((err) => {
      globalForEvents.eventSchemaReady = undefined;
      throw err;
    });
  }
  await globalForEvents.eventSchemaReady;
}

export type EventRow = {
  id: string;
  signature: string;
  event_type: string;
  signer: string;
  success: boolean;
  timestamp: string;
  message?: string;
  metadata?: any;
};

export async function listEvents(limit = 20): Promise<EventRow[]> {
  const sql = getSql();
  await ensureTable(sql);
  return sql<EventRow[]>`
    SELECT id, signature, event_type, signer, success, timestamp, message, metadata
    FROM protocol_events
    ORDER BY timestamp DESC
    LIMIT ${limit}
  `;
}

export type AddEventInput = {
  id?: string;
  signature: string;
  eventType: string;
  signer: string;
  success: boolean;
  timestamp: number;
  message?: string;
  metadata?: any;
};

export async function addEvent(input: AddEventInput): Promise<void> {
  const sql = getSql();
  await ensureTable(sql);
  const id = input.id || crypto.randomUUID();
  await sql`
    INSERT INTO protocol_events
      (id, signature, event_type, signer, success, timestamp, message, metadata)
    VALUES
      (${id}, ${input.signature}, ${input.eventType}, ${input.signer},
       ${input.success}, ${input.timestamp}, ${input.message || null},
       ${input.metadata ? JSON.stringify(input.metadata) : null})
    ON CONFLICT (id) DO NOTHING
  `;
}
