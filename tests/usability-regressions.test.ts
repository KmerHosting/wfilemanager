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

test("application content has an explicit fixed-header offset", async () => {
  const layout = await read("src/routes/_app.tsx");
  const topbar = await read("src/components/app-shell/topbar.tsx");
  expect(layout).toContain('style={{ paddingTop: "3rem" }}');
  expect(layout).toContain('style={{ paddingTop: "1rem" }}');
  expect(topbar).toContain("style={{ marginTop: 0 }}");
});

test("Carbon dialog receives direct ModalHeader and ModalFooter children", async () => {
  const dialog = await read("src/components/ui/dialog.tsx");
  expect(dialog).toContain("<ModalHeader");
  expect(dialog).toContain("<ModalFooter");
  expect(dialog).toContain("onClose={() => context.onOpenChange?.(false)}");
  expect(dialog).toContain("header.props.children");
  expect(dialog).toContain("footer.props.children");
});

test("long file operations keep a visible toast until success or failure", async () => {
  const api = await read("src/lib/local-api.ts");
  expect(api).toContain("withOperationToast");
  expect(api).toContain("duration: Infinity");
  expect(api).toContain("toast.success(`${label} completed`");
  expect(api).toContain("toast.error(errorMessage(error, `${label} failed`)");
  expect(api).toContain('"Move to Trash started…", "Moved to Trash"');
  expect(api).toContain('"Saving file…", "File saved"');
  expect(api).toContain("Upload completed");
});

test("About shows GitHub as installation metadata", async () => {
  const about = await read("src/routes/_app.about.tsx");
  expect(about).toContain('<span className="text-muted-foreground">GitHub</span>');
  expect(about).toContain("KmerHosting/wfilemanager");
  expect(about).not.toContain('aria-label="Open wFileManager on GitHub"');
});
