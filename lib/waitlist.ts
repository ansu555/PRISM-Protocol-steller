import postgres from "postgres";

class WaitlistDatabaseConfigError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "WaitlistDatabaseConfigError";
  }
}

const globalForWaitlist = globalThis as typeof globalThis & {
  waitlistSql?: ReturnType<typeof postgres>;
  waitlistSchemaReady?: Promise<void>;
};

function getWaitlistSql() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new WaitlistDatabaseConfigError();
  }

  if (!globalForWaitlist.waitlistSql) {
    globalForWaitlist.waitlistSql = postgres(databaseUrl, {
      max: 3,
      prepare: false,
    });
  }

  return globalForWaitlist.waitlistSql;
}

async function ensureWaitlistTable(sql: ReturnType<typeof postgres>) {
  if (!globalForWaitlist.waitlistSchemaReady) {
    globalForWaitlist.waitlistSchemaReady = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS waitlist_subscribers (
          id text PRIMARY KEY,
          email text NOT NULL UNIQUE,
          source text NOT NULL DEFAULT 'landing_nav',
          user_agent text,
          referrer text,
          created_at timestamptz NOT NULL DEFAULT now()
        )
      `;

      await sql`
        CREATE INDEX IF NOT EXISTS waitlist_subscribers_created_at_idx
        ON waitlist_subscribers (created_at DESC)
      `;
    })().catch((error) => {
      globalForWaitlist.waitlistSchemaReady = undefined;
      throw error;
    });
  }

  await globalForWaitlist.waitlistSchemaReady;
}

export async function addWaitlistSubscriber({
  email,
  source = "landing_nav",
  userAgent,
  referrer,
}: {
  email: string;
  source?: string;
  userAgent?: string | null;
  referrer?: string | null;
}) {
  const sql = getWaitlistSql();
  await ensureWaitlistTable(sql);

  const normalizedEmail = email.trim().toLowerCase();
  const rows = await sql`
    INSERT INTO waitlist_subscribers (
      id,
      email,
      source,
      user_agent,
      referrer
    )
    VALUES (
      ${crypto.randomUUID()},
      ${normalizedEmail},
      ${source},
      ${userAgent ?? null},
      ${referrer ?? null}
    )
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `;

  return {
    status: rows.length > 0 ? "created" : "existing",
  } as const;
}

export { WaitlistDatabaseConfigError };
