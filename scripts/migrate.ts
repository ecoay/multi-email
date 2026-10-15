import { closeDb, ensureSchema } from "../lib/db";

await ensureSchema();
await closeDb();
console.log("Schema is up to date.");
