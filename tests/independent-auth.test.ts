import { access, readFile } from "node:fs/promises";
import { test, expect } from "bun:test";

const read = (path: string) => readFile(path, "utf8");
const missing = async (path: string) =>
  access(path)
    .then(() => false)
    .catch(() => true);

test("wFileManager uses local multi-user authentication", async () => {
  const [auth, api, store, login, setup] = await Promise.all([
    read("src/lib/auth.tsx"),
    read("src/lib/wfilemanager-api.ts"),
    read("src/lib/server/admin-store.ts"),
    read("src/routes/login.tsx"),
    read("src/routes/setup.tsx"),
  ]);

  expect(auth).toContain("wfilemanagerApi.login(username, password, remember)");
  expect(api).toContain("isAdmin: boolean");
  expect(api).toContain("setupCode: string");
  expect(store).toContain("function createUserTable");
  expect(store).toContain("username TEXT NOT NULL COLLATE NOCASE UNIQUE");
  expect(store).toContain("user_id TEXT NOT NULL REFERENCES wfm_users(id) ON DELETE CASCADE");
  expect(store).toContain('SCHEMA_VERSION = "multi-user-v1"');
  expect(store).toContain("Administrator access is required.");
  expect(store).toContain("DROP TABLE IF EXISTS wfm_roles");
  expect(login).toContain('labelText="Username"');
  expect(setup).toContain("Administrator username: <strong>admin</strong>");
  expect(setup).toContain("Setup code");

  const combined = `${auth}\n${api}\n${store}`;
  expect(combined).not.toContain("dashboard.kmerhosting.com");
  expect(combined).not.toContain("dashboard-sso");
  expect(combined).not.toContain("dashboard_product_identities");
});

test("first-run setup code must come from the browser, not a gateway bypass", async () => {
  const [gateway, sqlite, installer] = await Promise.all([
    read("src/routes/api.gateway.ts"),
    read("src/routes/api.sqlite.ts"),
    read("deploy/install.sh"),
  ]);

  expect(gateway).not.toContain("setupSecret: await setupSecret()");
  expect(sqlite).toContain('String(payload.setupCode || "")');
  expect(sqlite).toContain("The setup code is invalid");
  expect(installer).toContain("openssl rand -hex 12");
  expect(installer).toContain("First-run setup code:");
});

test("removed administration products cannot reappear as routes", async () => {
  for (const file of [
    "src/routes/_app.users.tsx",
    "src/routes/_app.roles.tsx",
    "src/routes/_app.terminal.tsx",
    "src/routes/_app.notifications.tsx",
    "src/routes/_app.logs.tsx",
    "src/routes/_app.tasks.tsx",
    "src/routes/_app.uploads.tsx",
    "src/routes/forgot-password.tsx",
    "src/routes/reset-password.tsx",
    "src/routes/locked.tsx",
    "src/routes/session-expired.tsx",
  ]) {
    expect(await missing(file)).toBe(true);
  }
});

test("gateway exposes account administration without exposing unrelated products", async () => {
  const gateway = await read("src/routes/api.gateway.ts");
  expect(gateway).toContain('auth: new Set(["status", "me", "logout"])');
  expect(gateway).toContain('login: new Set(["login"])');
  expect(gateway).toContain('setup: new Set(["setup"])');
  expect(gateway).toContain('account: new Set(["password"])');
  expect(gateway).toContain(
    'users: new Set(["list", "create", "reset-password", "suspension", "delete"])',
  );
  for (const retired of ["roles:", "notifications:", "presence:", "profile", "sessions"]) {
    expect(gateway).not.toContain(retired);
  }
});

test("standard sessions can use file APIs but not account administration", async () => {
  const [localApi, localAuth, sqlite, store] = await Promise.all([
    read("src/routes/api.local.ts"),
    read("src/lib/server/local-auth-runtime.ts"),
    read("src/routes/api.sqlite.ts"),
    read("src/lib/server/admin-store.ts"),
  ]);

  expect(localApi).toContain("auth.requireUser(request)");
  expect(localApi).not.toContain("auth.requireAdmin(request)");
  expect(localAuth).toContain("export async function requireAdmin");
  expect(sqlite).toContain("listUsers(user)");
  expect(store).toContain("Administrator access is required");
});

test("production dependency set has no web terminal native stack", async () => {
  const pkg = JSON.parse(await read("package.json")) as { dependencies?: Record<string, string> };
  expect(pkg.dependencies?.["node-pty"]).toBeUndefined();
  expect(pkg.dependencies?.["@xterm/xterm"]).toBeUndefined();
  expect(pkg.dependencies?.["@xterm/addon-fit"]).toBeUndefined();
  expect(await missing("src/lib/server/terminal-runtime.ts")).toBe(true);
});
