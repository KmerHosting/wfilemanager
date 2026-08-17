import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";

const root = new URL("../", import.meta.url);
const uiRoots = ["src/routes", "src/components/app-shell", "src/components/auth"];
const explicitFiles = [
  "src/carbon.scss",
  "src/styles.scss",
  "src/lib/local-api.ts",
  "src/lib/notifications.tsx",
  "src/lib/theme.tsx",
];
const extensions = new Set([".ts", ".tsx", ".scss", ".css"]);
const violations = [];

async function walk(path) {
  const entries = await readdir(new URL(path, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) files.push(...(await walk(`${child}/`)));
    else if (extensions.has(extname(entry.name))) files.push(child);
  }
  return files;
}

const files = [
  ...new Set([
    ...(await Promise.all(uiRoots.map((path) => walk(`${path}/`)))).flat(),
    ...explicitFiles,
  ]),
];

for (const file of files) {
  const content = await readFile(new URL(file, root), "utf8");
  const checks = [
    [/@\/components\/ui\//, "legacy shadcn/Radix UI import"],
    [/@radix-ui\//, "Radix UI import"],
    [/from ["']sonner["']/, "Sonner notification import"],
    [/tailwindcss|tw-animate-css/, "Tailwind styling dependency in user-facing source"],
    [/styles\.css\?url/, "legacy styles.css import"],
  ];
  for (const [pattern, label] of checks) {
    if (pattern.test(content)) violations.push(`${file}: ${label}`);
  }
}

const styles = await readFile(new URL("src/styles.scss", root), "utf8");
for (const required of [
  "@carbon/react/scss/type",
  "@carbon/react/scss/spacing",
  "@carbon/react/scss/breakpoint",
  "@carbon/react/scss/motion",
]) {
  if (!styles.includes(required)) violations.push(`src/styles.scss: missing ${required}`);
}
if (/#[0-9a-fA-F]{3,8}\b/.test(styles)) {
  violations.push("src/styles.scss: raw hexadecimal color detected; use Carbon semantic tokens");
}

const carbon = await readFile(new URL("src/carbon.scss", root), "utf8");
for (const required of ['@use "@carbon/react"', "themes.$white", "themes.$g100", "theme.theme"]) {
  if (!carbon.includes(required)) violations.push(`src/carbon.scss: missing ${required}`);
}

const routeRoot = await readFile(new URL("src/routes/__root.tsx", root), "utf8");
if (!routeRoot.includes("NotificationProvider")) {
  violations.push("root route: Carbon notification provider not mounted");
}
if (routeRoot.includes("fonts.googleapis.com") || routeRoot.includes("fonts.gstatic.com")) {
  violations.push("root route: external Google font dependency detected");
}

const app = await readFile(new URL("src/routes/_app.tsx", root), "utf8");
if (!app.includes("HeaderContainer") || !app.includes("Content")) {
  violations.push("app shell: Carbon HeaderContainer/Content not used");
}

const sidebar = await readFile(new URL("src/components/app-shell/sidebar.tsx", root), "utf8");
if (!sidebar.includes("isRail") || !sidebar.includes("SideNav")) {
  violations.push("side navigation: Carbon rail SideNav not used");
}

const localApi = await readFile(new URL("src/lib/local-api.ts", root), "utf8");
if (localApi.includes("sonner") || localApi.includes("toast.")) {
  violations.push("local API: visual feedback must be owned by Carbon frontend notifications");
}

const visibleRoutes = [
  "src/routes/login.tsx",
  "src/routes/setup.tsx",
  "src/routes/_app.index.tsx",
  "src/routes/_app.explorer.tsx",
  "src/routes/_app.trash.tsx",
  "src/routes/_app.account.tsx",
  "src/routes/_app.about.tsx",
];
for (const file of visibleRoutes) {
  const content = await readFile(new URL(file, root), "utf8");
  if (!content.includes("@carbon/react")) {
    violations.push(`${file}: no @carbon/react component import`);
  }
}

if (violations.length) {
  console.error(
    "Carbon conformance audit failed:\n" + violations.map((item) => `- ${item}`).join("\n"),
  );
  process.exit(1);
}

console.log(`Carbon conformance audit passed for ${files.length} user-facing source files.`);
