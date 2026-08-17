import os from "node:os";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMON_LOCATIONS = ["/", "/root", "/etc", "/var/www", "/opt"] as const;
const MAX_TEXT_BYTES = Number(process.env.WFILEMANAGER_MAX_TEXT_BYTES || 5 * 1024 * 1024);
const MAX_UPLOAD_BYTES = Number(
  process.env.WFILEMANAGER_MAX_UPLOAD_BYTES || 10 * 1024 * 1024 * 1024,
);

async function osRelease() {
  const result: Record<string, string> = {};
  try {
    const value = await readFile("/etc/os-release", "utf8");
    for (const line of value.split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      result[match[1]] = match[2].trim().replace(/^(\"|')(.*)\1$/, "$2");
    }
  } catch {
    // The generic Node platform values below remain available.
  }
  return result;
}

async function locationStatus(path: string) {
  const info = await stat(path).catch(() => null);
  if (!info?.isDirectory())
    return {
      path,
      exists: false,
      readable: false,
      writable: false,
      entries: null as number | null,
    };
  const [readable, writable, entries] = await Promise.all([
    access(path, fsConstants.R_OK)
      .then(() => true)
      .catch(() => false),
    access(path, fsConstants.W_OK)
      .then(() => true)
      .catch(() => false),
    readdir(path)
      .then((items) => items.length)
      .catch(() => null),
  ]);
  return { path, exists: true, readable, writable, entries };
}

async function linuxLoginUsers() {
  try {
    const passwd = await readFile("/etc/passwd", "utf8");
    return passwd
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(":"))
      .filter((parts) => {
        const username = parts[0] || "";
        const uid = Number(parts[2]);
        const shell = parts[6] || "";
        const interactive =
          Boolean(shell) && !shell.endsWith("/nologin") && !shell.endsWith("/false");
        return interactive && (username === "root" || uid >= 1000);
      }).length;
  } catch {
    return 0;
  }
}

function validIpv4(value: string | undefined | null) {
  if (!value) return null;
  const match = value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
  if (!match) return null;
  const octets = match[0].split(".").map(Number);
  return octets.every((octet) => octet >= 0 && octet <= 255) ? match[0] : null;
}

async function primaryIpv4() {
  const configured = validIpv4(process.env.WFILEMANAGER_SERVER_IPV4);
  if (configured) return configured;

  try {
    const { stdout } = await execFileAsync("ip", ["-4", "route", "get", "1.1.1.1"], {
      timeout: 2000,
    });
    const routeSource = stdout.match(/\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})\b/)?.[1];
    const detected = validIpv4(routeSource);
    if (detected) return detected;
  } catch {
    // Fall through to another local-only detection method.
  }

  try {
    const { stdout } = await execFileAsync("hostname", ["-I"], { timeout: 2000 });
    for (const candidate of stdout.trim().split(/\s+/)) {
      const detected = validIpv4(candidate);
      if (detected && !detected.startsWith("127.")) return detected;
    }
  } catch {
    // Fall through to Node's interface list when libuv supports it.
  }

  try {
    const interfaces = os.networkInterfaces();
    for (const addresses of Object.values(interfaces)) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) return address.address;
      }
    }
  } catch {
    // Some virtualized Linux environments return UV_ENOTSUP here. IPv4 is optional metadata.
  }

  return null;
}

export async function fileManagerSummary() {
  const [release, locations, loginUsers, ipv4] = await Promise.all([
    osRelease(),
    Promise.all(COMMON_LOCATIONS.map(locationStatus)),
    linuxLoginUsers(),
    primaryIpv4(),
  ]);
  const root = locations.find((location) => location.path === "/") || null;
  const availableLocations = locations.filter(
    (location) => location.exists && location.readable,
  ).length;
  const writableLocations = locations.filter(
    (location) => location.exists && location.writable,
  ).length;

  return {
    hostname: os.hostname(),
    ipv4,
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    uptime: os.uptime(),
    node: process.version,
    loginUsers,
    root: {
      path: "/",
      entries: root?.entries ?? null,
      readable: root?.readable ?? false,
      writable: root?.writable ?? false,
    },
    locations,
    availableLocations,
    writableLocations,
    totalCommonLocations: COMMON_LOCATIONS.length,
    editorLimitBytes: MAX_TEXT_BYTES,
    uploadLimitBytes: MAX_UPLOAD_BYTES,
    protectedPseudoFilesystems: ["/proc", "/sys", "/dev", "/run"],
    os: {
      id: release.ID || os.platform(),
      name: release.NAME || os.platform(),
      versionId: release.VERSION_ID || os.release(),
      versionCodename: release.VERSION_CODENAME || "",
      prettyName: release.PRETTY_NAME || `${os.platform()} ${os.release()}`,
    },
    generatedAt: new Date().toISOString(),
  };
}
