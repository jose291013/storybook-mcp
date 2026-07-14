import fs from "fs";
import path from "path";
import pg from "pg";

let pool;

export function databaseEnabled() {
  return Boolean(String(process.env.DATABASE_URL || "").trim());
}

export function getDatabasePool() {
  if (!databaseEnabled()) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

export async function runDatabaseMigrations() {
  const database = getDatabasePool();
  if (!database) return { enabled: false, migrations: [] };
  const directory = path.resolve("db/migrations");
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    await database.query(fs.readFileSync(path.join(directory, file), "utf8"));
  }
  return { enabled: true, migrations: files };
}
