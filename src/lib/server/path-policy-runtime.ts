import path from "node:path";
import { lstat, realpath } from "node:fs/promises";
import { LocalApiError, normalizeServerPath } from "@/lib/server/local-runtime";
import type { LocalUser } from "@/lib/server/local-auth-runtime";

export async function assertExistingPathAllowed(_user: LocalUser, inputPath: unknown) {
  const requested = normalizeServerPath(inputPath);
  const info = await lstat(requested).catch(() => null);
  if (!info) throw new LocalApiError(404, "The selected filesystem path does not exist");
  return realpath(requested).catch(() => requested);
}

export async function assertDestinationPathAllowed(_user: LocalUser, inputPath: unknown) {
  const requested = normalizeServerPath(inputPath);
  const parent = path.dirname(requested);
  const canonicalParent = await realpath(parent).catch(() => null);
  if (!canonicalParent)
    throw new LocalApiError(404, "The destination parent directory does not exist");
  return path.join(canonicalParent, path.basename(requested));
}

export async function assertDirectoryPathAllowed(user: LocalUser, inputPath: unknown) {
  const target = await assertExistingPathAllowed(user, inputPath);
  const info = await lstat(target);
  if (!info.isDirectory()) throw new LocalApiError(400, "The selected path is not a directory");
  return target;
}

export function assertKnownPathAllowed(_user: LocalUser, inputPath: unknown) {
  return normalizeServerPath(inputPath);
}
