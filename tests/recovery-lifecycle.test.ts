import { readFile } from "node:fs/promises";
import { test, expect } from "bun:test";

const read = (path: string) => readFile(path, "utf8");

test("installer is domain-independent and does not build on the customer server", async () => {
  const installer = await read("deploy/install.sh");

  expect(installer).toContain("WFILEMANAGER_DATABASE_MODE=sqlite");
  expect(installer).toContain("HOST=0.0.0.0");
  expect(installer).toContain("http://$OPEN_HOST:$PORT/$OPEN_PATH");
  expect(installer).not.toContain("certbot");
  expect(installer).not.toContain("nginx");
  expect(installer).not.toContain("getent ahostsv4");
  expect(installer).not.toContain("api.ipify.org");
  expect(installer).not.toContain("bun.sh");
  expect(installer).not.toContain("build-essential");
  expect(installer).not.toContain("g++");
  expect(installer).not.toContain("make");
  expect(installer).not.toContain("python3");
});

test("updater only verifies extracts switches restarts and health checks prebuilt releases", async () => {
  const updater = await read("deploy/update.sh");

  expect(updater).toContain("Downloading prebuilt wFileManager");
  expect(updater).toContain(".output/server/index.mjs");
  expect(updater).toContain("sha256sum");
  expect(updater).toContain("health_check");
  expect(updater).toContain("rolling-back");
  expect(updater).not.toContain("bun install");
  expect(updater).not.toContain("bun run build");
  expect(updater).not.toContain("bun run typecheck");
  expect(updater).not.toContain("node-gyp");
  expect(updater).not.toContain("python3");
});

test("GitHub release workflow builds once and publishes a prebuilt runtime", async () => {
  const workflow = await read(".github/workflows/publish-github-release.yml");

  expect(workflow).toContain("Build production runtime");
  expect(workflow).toContain("bun run build");
  expect(workflow).toContain('cp -a .output "$ROOT/.output"');
  expect(workflow).toContain("Prebuilt Linux x64 runtime");
  expect(workflow).not.toContain("git archive --format=tar.gz");
});

test("administrator recovery is one shell command with no username selection", async () => {
  const reset = await read("deploy/wfilemanager-reset-admin-password");

  expect(reset).toContain("wfm_admin");
  expect(reset).toContain("DELETE FROM wfm_sessions");
  expect(reset).toContain("Usage: sudo wfilemanager-reset-admin-password");
  expect(reset).not.toContain("wfm_users");
  expect(reset).not.toContain("Specify an administrator username");
});

test("uninstaller removes only wFileManager and does not own the web stack", async () => {
  const uninstall = await read("deploy/uninstall.sh");

  expect(uninstall).toContain("It does NOT remove Node.js or other system packages");
  expect(uninstall).not.toContain("certbot delete");
  expect(uninstall).not.toContain("sites-enabled/wfilemanager");
  expect(uninstall).not.toContain("apt-get purge");
});
