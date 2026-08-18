import os from "node:os";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const COMMON_LOCATIONS = ["/", "/root", "/etc", "/var/www", "/opt"] as const;
const IP_COMMANDS = ["ip", "/usr/sbin/ip", "/sbin/ip", "/usr/bin/ip", "/bin/ip"] as const;
const HOSTNAME_COMMANDS = ["hostname", "/usr/bin/hostname", "/bin/hostname"] as const;
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

function isUsableIpv4(value: string) {
  const [first, second] = value.split(".").map(Number);
  if (first === 0 || first === 127 || first >= 224) return false;
  if (first === 169 && second === 254) return false;
  return true;
}

function isPrivateIpv4(value: string) {
  const [first, second] = value.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 100 && second >= 64 && second <= 127)
  );
}

async function execFirst(commands: readonly string[], args: string[]) {
  for (const command of commands) {
    try {
      const { stdout } = await execFileAsync(command, args, { timeout: 2000 });
      if (stdout.trim()) return stdout;
    } catch {
      // Try the next common absolute path. systemd services can have a reduced PATH.
    }
  }
  return "";
}

function addIpv4Candidate(candidates: Set<string>, value: string | undefined | null) {
  const detected = validIpv4(value);
  if (detected && isUsableIpv4(detected)) candidates.add(detected);
}

async function primaryIpv4() {
  const configured = validIpv4(process.env.WFILEMANAGER_SERVER_IPV4);
  if (configured && isUsableIpv4(configured)) return configured;

  const candidates = new Set<string>();

  const routeOutput = await execFirst(IP_COMMANDS, ["-4", "route", "get", "1.1.1.1"]);
  addIpv4Candidate(
    candidates,
    routeOutput.match(/\bsrc\s+((?:\d{1,3}\.){3}\d{1,3})\b/)?.[1],
  );

  const addressOutput = await execFirst(IP_COMMANDS, ["-o", "-4", "addr", "show", "scope", "global"]);
  for (const match of addressOutput.matchAll(/\binet\s+((?:\d{1,3}\.){3}\d{1,3})\/\d+\b/g)) {
    addIpv4Candidate(candidates, match[1]);
  }

  const hostnameOutput = await execFirst(HOSTNAME_COMMANDS, ["-I"]);
  for (const candidate of hostnameOutput.trim().split(/\s+/)) {
    addIpv4Candidate(candidates, candidate);
  }

  try {
    const fibTrie = await readFile("/proc/net/fib_trie", "utf8");
    for (const match of fibTrie.matchAll(
      /\|--\s+((?:\d{1,3}\.){3}\d{1,3})\s*\n\s*\/32 host LOCAL/g,
    )) {
      addIpv4Candidate(candidates, match[1]);
    }
  } catch {
    // /proc can be restricted by hardened service settings; other methods remain available.
  }

  try {
    const interfaces = os.networkInterfaces();
    for (const addresses of Object.values(interfaces)) {
      for (const address of addresses || []) {
        if (address.family === "IPv4" && !address.internal) {
          addIpv4Candidate(candidates, address.address);
        }
      }
    }
  } catch {
    // Some standalone or virtualized Linux runtimes return UV_ENOTSUP here.
  }

  const values = [...candidates];
  return values.find((value) => !isPrivateIpv4(value)) || values[0] || null;
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
