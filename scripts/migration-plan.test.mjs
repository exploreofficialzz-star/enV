import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isMigrationFile, migrationName, pendingMigrations } from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

test("migration keys use the basename", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a migration already recorded by basename is not applied twice", () => {
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending SQL migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-SQL entries are dropped", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("the production auth schema is a root-level migration for explicit deployment", () => {
  const migrationsDir = join(projectRoot(), "migrations");
  const entries = readdirSync(migrationsDir);
  assert.ok(entries.includes("0001_auth.sql"));
  assert.deepEqual(pendingMigrations(entries, []), [{ name: "0001_auth.sql", path: "0001_auth.sql" }]);
});

test("migration files sort and apply idempotently in a fresh workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "migration-plan-"));
  const dir = join(root, "migrations");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "0002_data.sql"), "select 2;\n");
  writeFileSync(join(dir, "0001_auth.sql"), "select 1;\n");
  const files = readdirSync(dir);
  assert.deepEqual(pendingMigrations(files, []), [
    { name: "0001_auth.sql", path: "0001_auth.sql" },
    { name: "0002_data.sql", path: "0002_data.sql" },
  ]);
  assert.deepEqual(pendingMigrations(files, ["0001_auth.sql"]), [
    { name: "0002_data.sql", path: "0002_data.sql" },
  ]);
});
