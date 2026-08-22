import { readFile } from "node:fs/promises";
import { test, expect } from "bun:test";

const read = (path: string) => readFile(path, "utf8");

test("installer is domain-independent, reachable and does not build on the customer server", async () => {
  const installer = await read("deploy/install.sh");

  expect(installer).toContain("WFILEMANAGER_DATABASE_MODE=sqlite");
  expect(installer).toContain("HOST=0.0.0.0");
  expect(installer).toContain("http://$OPEN_HOST:$PORT/$OPEN_PATH");
  expect(installer).toContain('ufw allow "$PORT/tcp"');
  expect(installer).toContain("Application status: HEALTHY");
  expect(installer).toContain("wfilemanager-doctor");
  expect(installer).toContain("10-root-terminal.conf");
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
  expect(updater).toContain("wfilemanager-doctor");
  expect(updater).toContain("UPDATER_COMMAND.next");
  expect(updater).not.toContain("bun install");
  expect(updater).not.toContain("bun run build");
  expect(updater).not.toContain("bun run typecheck");
  expect(updater).not.toContain("node-gyp");
  expect(updater).not.toContain("python3");
});

test("GitHub release workflow builds once and publishes an updater-compatible archive", async () => {
  const workflow = await read(".github/workflows/publish-github-release.yml");

  expect(workflow).toContain("Build production runtime");
  expect(workflow).toContain("bun run build");
  expect(workflow).toContain('tar -czf "$ARCHIVE" .output package.json deploy');
  expect(workflow).toContain('find "$CHECK_ROOT" -maxdepth 3');
  expect(workflow).toContain('test -f "$PROJECT_DIR/.output/server/index.mjs"');
  expect(workflow).toContain('test -f "$PROJECT_DIR/package.json"');
  expect(workflow).toContain('test -f "$PROJECT_DIR/deploy/wfilemanager-reset-admin-password"');
  expect(workflow).toContain("Prebuilt Linux x64 runtime");
  expect(workflow).not.toContain('cp -a .output "$ROOT/.output"');
  expect(workflow).not.toContain("git archive --format=tar.gz");
  expect(workflow).not.toContain("Install native build tools");
  expect(workflow).not.toContain("build-essential");
  expect(workflow).not.toContain("python3");
});

test("stable release sync uses the KmerHosting repository and current product notes", async () => {
  const sync = await read("deploy/sync-stable-channel.sh");

  expect(sync).toContain("KmerHosting/wfilemanager");
  expect(sync).not.toContain("toscani-tenekeu/wFileManager");
  expect(sync).not.toContain("Carbon Design System migration");
});

test("administrator recovery is one shell command with no username selection", async () => {
  const reset = await read("deploy/wfilemanager-reset-admin-password");
  const doctor = await read("deploy/wfilemanager-doctor");

  expect(reset).toContain("wfm_admin");
  expect(reset).toContain("DELETE FROM wfm_sessions");
  expect(reset).toContain("Usage: sudo wfilemanager-reset-admin-password");
  expect(reset).not.toContain("wfm_users");
  expect(reset).not.toContain("Specify an administrator username");
  expect(doctor).toContain("The wFileManager application itself is working.");
  expect(doctor).toContain("VPS provider firewall/security group");
});

test("uninstaller removes dedicated integrations without uninstalling the web stack", async () => {
  const uninstall = await read("deploy/uninstall.sh");

  expect(uninstall).toContain(
    "It does NOT remove Node.js, Nginx, Certbot or other system packages",
  );
  expect(uninstall).toContain("wfilemanager-doctor");
  expect(uninstall).toContain("10-root-terminal.conf");
  expect(uninstall).toContain("/etc/nginx/sites-enabled");
  expect(uninstall).toContain('certbot delete --cert-name "$certificate_name"');
  expect(uninstall).toContain("certificate_still_referenced");
  expect(uninstall).toContain('ufw --force delete allow "$PORT/tcp"');
  expect(uninstall).not.toContain("apt-get purge");
});
