import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("wFileManager remains independently authenticated", async () => {
  const [login, account, sqlite, routeTree] = await Promise.all([
    source("src/routes/login.tsx"),
    source("src/routes/_app.account.tsx"),
    source("src/lib/server/sqlite-store.ts"),
    source("src/routeTree.gen.ts"),
  ]);

  expect(login).toContain("auth.login(user, pass, remember)");
  expect(login).not.toMatch(/dashboard\.kmerhosting|KmerHosting Account|api\/auth\/kmerhosting/i);
  expect(account).toContain("changePassword");
  expect(account).toContain("updateAccountProfile");
  expect(account).not.toMatch(/KmerHosting Account|dashboard\.kmerhosting/i);
  expect(sqlite).not.toMatch(/loginWithCentralEmail|login_kmerhosting/);
  expect(routeTree).not.toContain("/api/auth/kmerhosting");
});
