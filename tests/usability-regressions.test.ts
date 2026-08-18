import { readFile } from "node:fs/promises";
import { expect, test } from "bun:test";

const read = (path: string) => readFile(path, "utf8");

test("overview IPv4 detection never depends solely on libuv network interfaces", async () => {
  const runtime = await read("src/lib/server/file-manager-runtime.ts");
  expect(runtime).toContain('execFileAsync("ip", ["-4", "route", "get", "1.1.1.1"]');
  expect(runtime).toContain('execFileAsync("hostname", ["-I"]');
  expect(runtime).toContain("os.networkInterfaces()");
  expect(runtime).toContain("UV_ENOTSUP");
  expect(runtime).toContain("ipv4,");
});

test("application shell delegates navigation and fixed-header behavior to Carbon", async () => {
  const layout = await read("src/routes/_app.tsx");
  const topbar = await read("src/components/app-shell/topbar.tsx");
  const sidebar = await read("src/components/app-shell/sidebar.tsx");
  const styles = await read("src/styles.scss");

  expect(layout).toContain("HeaderContainer");
  expect(layout).toContain('<Content id="main-content" className="wfm-app-content">');
  expect(topbar).toContain("SkipToContent");
  expect(sidebar).toContain("isRail");
  expect(styles).toContain("min-block-size: calc(100dvh - 3rem)");
  expect(styles).toContain("margin-inline-start: 3rem");
});

test("full-page loading uses Carbon overlay over the real screen", async () => {
  const layout = await read("src/routes/_app.tsx");
  const styles = await read("src/styles.scss");

  expect(layout).toContain('<Loading description="Loading wFileManager" withOverlay />');
  expect(layout).toContain("function AppShell()");
  expect(layout).toContain("<AppShell />");
  expect(layout).toContain('aria-hidden="true" inert');
  expect(layout).not.toContain("SkeletonText");
  expect(layout).not.toContain("SkeletonPlaceholder");
  expect(styles).not.toContain(".cds--loading-overlay");
  expect(styles).not.toContain("--cds-overlay:");
});

test("administrator password change uses canonical Carbon form structure", async () => {
  const account = await read("src/routes/_app.account.tsx");
  const styles = await read("src/styles.scss");

  expect(account).toContain("Form");
  expect(account).toContain("PasswordInput");
  expect(account).toContain('<Form\n            className="wfm-account-password-form"');
  expect(account).not.toContain("<Layer>");
  expect(styles).toContain(".wfm-account-password-form__fields");
  expect(styles).toContain("gap: spacing.$spacing-07");
  expect(styles).not.toContain("grid-template-columns: repeat(3");
});

test("visible dialogs use Carbon Modal directly instead of a parallel dialog system", async () => {
  const explorer = await read("src/routes/_app.explorer.tsx");
  const trash = await read("src/routes/_app.trash.tsx");
  const carbonGuide = await read("docs/CARBON.md");

  expect(explorer).toContain("Modal");
  expect(trash).toContain("Modal");
  expect(explorer).not.toContain("@/components/ui/dialog");
  expect(trash).not.toContain("@/components/ui/dialog");
  expect(carbonGuide).toContain("Carbon `HeaderContainer`");
});

test("long file operations report progress to Carbon-owned frontend feedback", async () => {
  const api = await read("src/lib/local-api.ts");
  const explorer = await read("src/routes/_app.explorer.tsx");
  const notifications = await read("src/lib/notifications.tsx");

  expect(api).toContain("OperationProgressCallback");
  expect(api).toContain("onProgress?.(current.job)");
  expect(api).not.toContain('from "sonner"');
  expect(explorer).toContain("timeout: 0");
  expect(explorer).toContain("localApi.copy");
  expect(explorer).toContain("localApi.move");
  expect(notifications).toContain("ToastNotification");
});

test("About shows GitHub as installation metadata", async () => {
  const about = await read("src/routes/_app.about.tsx");
  expect(about).toContain("<dt>Source</dt>");
  expect(about).toContain("https://github.com/KmerHosting/wfilemanager");
  expect(about).toContain("GitHub");
});
