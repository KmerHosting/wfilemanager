import { access, readFile } from "node:fs/promises";
import { test, expect } from "bun:test";

const read = (path: string) => readFile(path, "utf8");
const missing = async (path: string) =>
  access(path)
    .then(() => false)
    .catch(() => true);

test("wFileManager has exactly one local administrator", async () => {
  const [auth, api, store, login, setup] = await Promise.all([
    read("src/lib/auth.tsx"),
    read("src/lib/wfilemanager-api.ts"),
    read("src/lib/server/admin-store.ts"),
    read("src/routes/login.tsx"),
    read("src/routes/setup.tsx"),
  ]);

  expect(auth).toContain("wfilemanagerApi.login(password, remember)");
  expect(api).toContain('username: "admin"');
  expect(api).toContain("setupCode: string");
  expect(store).toContain("CREATE TABLE IF NOT EXISTS wfm_admin");
  expect(store).toContain("PRIMARY KEY CHECK (id = 1)");
  expect(store).toContain("DROP TABLE IF EXISTS wfm_users");
  expect(store).toContain("DROP TABLE IF EXISTS wfm_roles");
  expect(login).toContain("Account: <strong>admin</strong>");
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

test("gateway exposes only status login setup logout and password change", async () => {
  const gateway = await read("src/routes/api.gateway.ts");
  expect(gateway).toContain('auth: new Set(["status", "me", "logout"])');
  expect(gateway).toContain('login: new Set(["login"])');
  expect(gateway).toContain('setup: new Set(["setup"])');
  expect(gateway).toContain('account: new Set(["password"])');
  for (const retired of [
    "users:",
    "roles:",
    "notifications:",
    "presence:",
    "profile",
    "sessions",
  ]) {
    expect(gateway).not.toContain(retired);
  }
});

test("production dependency set has no web terminal native stack", async () => {
  const pkg = JSON.parse(await read("package.json")) as { dependencies?: Record<string, string> };
  expect(pkg.dependencies?.["node-pty"]).toBeUndefined();
  expect(pkg.dependencies?.["@xterm/xterm"]).toBeUndefined();
  expect(pkg.dependencies?.["@xterm/addon-fit"]).toBeUndefined();
  expect(await missing("src/lib/server/terminal-runtime.ts")).toBe(true);
});
