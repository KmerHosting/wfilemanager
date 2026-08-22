import { afterAll, expect, test } from "bun:test";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const roots: string[] = [];
const storeUrl = pathToFileURL(path.join(process.cwd(), "src/lib/server/admin-store.ts")).href;

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

async function runStoreScript(source: string) {
  const root = await mkdtemp(path.join(os.tmpdir(), "wfm-users-"));
  roots.push(root);
  await execFileAsync("node", ["--experimental-strip-types", "--input-type=module", "-e", source], {
    env: {
      ...process.env,
      WFILEMANAGER_SQLITE_PATH: path.join(root, "wfilemanager.db"),
    },
  });
}

test("administrator controls users and account changes revoke sessions", async () => {
  await runStoreScript(`
    const store = await import(${JSON.stringify(storeUrl)});
    const adminPassword = "AdminSecure1234";
    const firstPassword = "UserSecure1234";
    const nextPassword = "FreshLogin5678";
    store.setup({ password: adminPassword });
    const adminLogin = store.login({ username: "admin", password: adminPassword });
    const admin = store.sessionUser(adminLogin.token);
    const alice = store.createUser(admin, {
      username: "alice",
      displayName: "Alice Example",
      password: firstPassword,
    });
    const aliceLogin = store.login({ username: "alice", password: firstPassword });
    const aliceRow = store.sessionUser(aliceLogin.token);
    try {
      store.listUsers(aliceRow);
      throw new Error("standard user unexpectedly listed users");
    } catch (error) {
      if (error.status !== 403) throw error;
    }
    store.resetUserPassword(admin, { userId: alice.id, password: nextPassword });
    try {
      store.sessionUser(aliceLogin.token);
      throw new Error("password reset did not revoke the session");
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    const nextLogin = store.login({ username: "alice", password: nextPassword });
    store.setUserSuspended(admin, { userId: alice.id, suspended: true });
    try {
      store.sessionUser(nextLogin.token);
      throw new Error("suspension did not revoke the session");
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    store.setUserSuspended(admin, { userId: alice.id, suspended: false });
    const finalLogin = store.login({ username: "alice", password: nextPassword });
    store.deleteUser(admin, { userId: alice.id });
    try {
      store.sessionUser(finalLogin.token);
      throw new Error("deletion did not revoke the session");
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    if (store.listUsers(admin).length !== 1) throw new Error("unexpected remaining users");
  `);
  expect(true).toBe(true);
});

test("single-admin database migration preserves credentials and sessions", async () => {
  await runStoreScript(`
    const { randomBytes, scryptSync, createHash } = await import("node:crypto");
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(process.env.WFILEMANAGER_SQLITE_PATH);
    const password = "LegacySecure1234";
    const salt = randomBytes(16).toString("hex");
    const hash = scryptSync(password, Buffer.from(salt, "hex"), 64).toString("hex");
    const token = "preserved-session-token";
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const now = new Date().toISOString();
    const expires = new Date(Date.now() + 60000).toISOString();
    db.exec(\`
      CREATE TABLE wfm_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO wfm_meta VALUES ('schema_version', 'single-admin-v2');
      INSERT INTO wfm_meta VALUES ('configured', 'true');
      CREATE TABLE wfm_admin (
        id INTEGER PRIMARY KEY CHECK (id = 1), password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL, last_login_at TEXT, created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE wfm_sessions (
        id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX wfm_sessions_expires_at_idx ON wfm_sessions(expires_at);
    \`);
    db.prepare("INSERT INTO wfm_admin VALUES(1, ?, ?, NULL, ?, ?)").run(hash, salt, now, now);
    db.prepare("INSERT INTO wfm_sessions VALUES('legacy', ?, ?, ?)").run(tokenHash, expires, now);
    db.close();

    const store = await import(${JSON.stringify(storeUrl)});
    if (store.sessionUser(token).username !== "admin") throw new Error("session was not preserved");
    if (store.login({ username: "admin", password }).user.username !== "admin") {
      throw new Error("credentials were not preserved");
    }
  `);
  expect(true).toBe(true);
});
