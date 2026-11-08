#!/usr/bin/env node
/**
 * Analytics-only PostgreSQL migrator.
 *
 * Dry-run is the default. Pass --apply only after confirming the database
 * target and a restorable backup. This runner has an explicit allowlist and
 * does not apply Product Feedback, Community, Wallet, or World Lab migrations.
 *
 * Every database operation runs inside one transaction. SET LOCAL and a
 * transaction-scoped advisory lock work with Supabase's transaction pooler
 * (DATABASE_URL on port 6543); no session state is required.
 */
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import {
  assertAnalyticsMigrationPrerequisites,
  pendingAnalyticsMigrations,
} from "./analytics/analytics-migration-plan.mjs";

const databaseUrl = process.env.DATABASE_URL?.trim() ?? "";
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const invalidArgs = args.filter((arg) => arg !== "--apply" && arg !== "--dry-run");

if (invalidArgs.length || (apply && args.includes("--dry-run"))) {
  console.error("[migrate:analytics] Use no arguments (dry-run), --dry-run, or --apply.");
  process.exitCode = 2;
} else if (!databaseUrl) {
  console.error("[migrate:analytics] DATABASE_URL is required. No database changes were made.");
  process.exitCode = 1;
} else {
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

  async function main() {
    const entries = await readdir(migrationsDir);
    // Validate the complete allowlist before opening a database connection.
    pendingAnalyticsMigrations(entries, []);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query("SET LOCAL search_path TO public");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended('enV:userbehavior:analytics-migrations', 0))",
      );

      const database = await client.query(
        "SELECT current_database() AS database_name, " +
        "to_regclass('public." + '"user"' + "') IS NOT NULL AS user_table_exists, " +
        "to_regclass('public._migrations') IS NOT NULL AS migrations_table_exists",
      );
      const target = database.rows[0];
      assertAnalyticsMigrationPrerequisites({ userTableExists: target.user_table_exists });

      let applied = [];
      if (target.migrations_table_exists) {
        const result = await client.query("SELECT name FROM public._migrations");
        applied = result.rows.map((row) => row.name);
      }

      const pending = pendingAnalyticsMigrations(entries, applied);
      console.log(
        "[migrate:analytics] database=" + target.database_name +
        "; mode=" + (apply ? "APPLY" : "DRY RUN") +
        "; pending=" + pending.length,
      );

      if (!pending.length) {
        console.log("[migrate:analytics] User Behavior migrations are already up to date.");
        await client.query("ROLLBACK");
        transactionOpen = false;
        return;
      }

      if (!apply) {
        for (const migration of pending) {
          console.log("[migrate:analytics] would apply " + migration.name);
        }
        console.log("[migrate:analytics] Dry-run only; no schema changes were made.");
        console.log("[migrate:analytics] After backup and target verification, rerun with --apply.");
        await client.query("ROLLBACK");
        transactionOpen = false;
        return;
      }

      if (!target.migrations_table_exists) {
        await client.query(
          "CREATE TABLE public._migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
        );
      }

      let count = 0;
      for (const migration of pending) {
        const sql = await readFile(join(migrationsDir, migration.path), "utf8");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO public._migrations (name) VALUES ($1)",
            [migration.name],
          );
        } catch (error) {
          console.error("[migrate:analytics] Failed while applying " + migration.name);
          throw error;
        }
        console.log("[migrate:analytics] applied " + migration.name);
        count += 1;
      }

      // The complete allowlisted batch and its ledger entries commit together.
      await client.query("COMMIT");
      transactionOpen = false;
      console.log("[migrate:analytics] completed; " + count + " analytics migration(s) applied.");
    } catch (error) {
      if (client && transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Preserve the original SQL error if the connection has dropped.
        }
      }
      throw error;
    } finally {
      if (client) client.release();
      await pool.end();
    }
  }

  main().catch((error) => {
    console.error("[migrate:analytics] stopped:", error?.message || error);
    for (const key of ["code", "detail", "hint", "position", "where"]) {
      if (error?.[key] != null) console.error("[migrate:analytics] " + key + ":", error[key]);
    }
    process.exitCode = 1;
  });
}
