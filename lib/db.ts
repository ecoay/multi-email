import postgres, { type Sql } from "postgres";

import { schemaStatements } from "@/lib/schema";

const globalForDb = globalThis as unknown as { sql?: Sql; schema?: Promise<void> };

export function databaseUrl(): string | undefined {
  const value = process.env.DATABASE_URL?.trim();
  return value || undefined;
}

export function getSql(): Sql {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set.");
  if (!globalForDb.sql) {
    globalForDb.sql = postgres(url, {
      max: 1,
      idle_timeout: 20,
      connect_timeout: 15,
      prepare: false,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    });
  }
  return globalForDb.sql;
}

export async function ensureSchema(): Promise<void> {
  if (!globalForDb.schema) {
    globalForDb.schema = applySchema().catch((error) => {
      globalForDb.schema = undefined;
      throw error;
    });
  }
  return globalForDb.schema;
}

async function applySchema(): Promise<void> {
  const sql = getSql();
  for (const statement of schemaStatements()) {
    await sql.unsafe(statement);
  }
}

export async function closeDb(): Promise<void> {
  if (globalForDb.sql) {
    await globalForDb.sql.end({ timeout: 5 });
    globalForDb.sql = undefined;
  }
  globalForDb.schema = undefined;
}
