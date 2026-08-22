import path from "node:path";
import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { sameOrigin } from "@/lib/server/request-security";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

async function runtime() {
  return import("@/lib/server/local-runtime");
}
async function authRuntime() {
  return import("@/lib/server/local-auth-runtime");
}
async function policyRuntime() {
  return import("@/lib/server/path-policy-runtime");
}
async function overviewRuntime() {
  return import("@/lib/server/file-manager-runtime");
}
async function safePathRuntime() {
  return import("@/lib/server/safe-path-runtime");
}
async function uploadRuntime() {
  return import("@/lib/server/upload-runtime");
}
async function directoryRuntime() {
  return import("@/lib/server/directory-runtime");
}
async function atomicFileRuntime() {
  return import("@/lib/server/atomic-file-runtime");
}
async function operationRuntime() {
  return import("@/lib/server/operation-jobs-runtime");
}
async function downloadRuntime() {
  return import("@/lib/server/download-runtime");
}
async function archiveRuntime() {
  return import("@/lib/server/archive-runtime");
}
async function handleError(error: unknown) {
  const { LocalApiError } = await runtime();
  if (error instanceof LocalApiError) return json({ error: error.message }, error.status);
  const value = error as NodeJS.ErrnoException;
  const status =
    value?.code === "ENOENT"
      ? 404
      : value?.code === "EACCES" || value?.code === "EPERM"
        ? 403
        : value?.code === "EEXIST"
          ? 409
          : 500;
  console.error(error);
  return json({ error: value?.message || "Local server operation failed" }, status);
}

export const Route = createFileRoute("/api/local")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const api = await runtime();
          const auth = await authRuntime();
          const policy = await policyRuntime();
          const url = new URL(request.url);
          const action = url.searchParams.get("action") || "list";
          const target = url.searchParams.get("path") || "/";

          if (action === "overview") {
            await auth.requireUser(request);
            const overview = await overviewRuntime();
            return json(await overview.fileManagerSummary());
          }
          if (action === "update-info" || action === "update-status") {
            await auth.requireUser(request);
            return json(await api.updateSummary());
          }
          if (action === "job") {
            const user = await auth.requireUser(request);
            const operations = await operationRuntime();
            return json({
              job: await operations.getOperationJob(user.id, url.searchParams.get("id")),
            });
          }
          if (action === "jobs") {
            const user = await auth.requireUser(request);
            const operations = await operationRuntime();
            return json({ jobs: await operations.listOperationJobs(user.id) });
          }
          if (action === "list") {
            const user = await auth.requireUser(request);
            const allowedTarget = await policy.assertDirectoryPathAllowed(user, target);
            const directory = await directoryRuntime();
            return json(
              await directory.listDirectoryPage(allowedTarget, {
                cursor: url.searchParams.get("cursor"),
                query: url.searchParams.get("q"),
                limit: url.searchParams.get("limit"),
              }),
            );
          }
          if (action === "read") {
            const user = await auth.requireUser(request);
            return json(
              await api.readTextFile(await policy.assertExistingPathAllowed(user, target)),
            );
          }
          if (action === "download") {
            const user = await auth.requireUser(request);
            const download = await downloadRuntime();
            return download.streamedDownloadResponse(
              request,
              await policy.assertExistingPathAllowed(user, target),
            );
          }
          if (action === "trash-list") {
            const user = await auth.requireUser(request);
            return json(await api.listTrash(user));
          }
          return json({ error: "Unknown action" }, 404);
        } catch (error) {
          return handleError(error);
        }
      },

      POST: async ({ request }) => {
        try {
          if (!sameOrigin(request)) return json({ error: "Cross-origin request rejected" }, 403);
          const api = await runtime();
          const auth = await authRuntime();
          const policy = await policyRuntime();
          const safe = await safePathRuntime();
          const url = new URL(request.url);
          const action = url.searchParams.get("action") || "";
          const user = await auth.requireUser(request);

          if (action === "upload-raw") {
            const upload = await uploadRuntime();
            const destinationDirectory = await policy.assertDirectoryPathAllowed(
              user,
              url.searchParams.get("path") || "/",
            );
            await policy.assertDestinationPathAllowed(
              user,
              path.join(destinationDirectory, String(url.searchParams.get("name") || "")),
            );
            return json(
              await upload.saveRawUpload(
                destinationDirectory,
                url.searchParams.get("name"),
                request.body,
              ),
              201,
            );
          }

          if (action === "upload") {
            const upload = await uploadRuntime();
            const destinationDirectory = await policy.assertDirectoryPathAllowed(
              user,
              url.searchParams.get("path") || "/",
            );
            const form = await request.formData();
            for (const value of form.values()) {
              if (value instanceof File) {
                await policy.assertDestinationPathAllowed(
                  user,
                  path.join(destinationDirectory, value.name),
                );
              }
            }
            return json(await upload.saveUploads(destinationDirectory, form), 201);
          }

          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

          if (action === "update-install") return json(await api.installAvailableUpdate(), 202);
          if (action === "update-rollback") return json(await api.rollbackApplicationUpdate(), 202);

          if (action === "create-file") {
            const destination = await policy.assertDestinationPathAllowed(
              user,
              path.join(String(body.path || "/"), String(body.name || "")),
            );
            await safe.assertDestinationAbsent(destination);
            return json(
              await api.createFileAt(
                path.dirname(destination),
                path.basename(destination),
                body.content,
              ),
              201,
            );
          }

          if (action === "create-directory") {
            const destination = await policy.assertDestinationPathAllowed(
              user,
              path.join(String(body.path || "/"), String(body.name || "")),
            );
            await safe.assertDestinationAbsent(destination);
            return json(
              await api.createDirectoryAt(path.dirname(destination), path.basename(destination)),
              201,
            );
          }

          if (action === "save") {
            const target = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.path),
            );
            const atomic = await atomicFileRuntime();
            return json(
              await atomic.saveTextFileAtomic(target, body.content, body.expectedModifiedAt),
            );
          }

          if (action === "rename") {
            const source = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.path),
            );
            const destination = await policy.assertDestinationPathAllowed(
              user,
              path.join(path.dirname(source), String(body.name || "")),
            );
            await safe.assertDestinationAbsent(destination);
            return json(await api.renameEntry(source, path.basename(destination)));
          }

          if (action === "trash-move") {
            const target = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.path),
            );
            return json(await api.moveToTrash(user, target), 201);
          }

          if (action === "trash-move-many") {
            const paths = Array.isArray(body.paths) ? body.paths : [];
            if (!paths.length) return json({ error: "Select at least one item" }, 400);
            if (paths.length > 1_000) return json({ error: "Too many selected items" }, 413);
            const items = [];
            for (const input of paths) {
              const target = await safe.assertSafeExistingMutation(
                await policy.assertExistingPathAllowed(user, input),
              );
              items.push(await api.moveToTrash(user, target));
            }
            return json({ items }, 201);
          }

          if (action === "chmod") {
            const target = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.path),
            );
            return json(await api.changeMode(target, body.mode));
          }

          if (action === "chown") {
            const target = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.path),
            );
            return json(await api.changeOwnership(target, body.uid, body.gid));
          }

          if (action === "archive-create") {
            const sourcesInput = Array.isArray(body.sources) ? body.sources : [];
            if (!sourcesInput.length || sourcesInput.length > 1_000)
              return json({ error: "Select between 1 and 1000 items" }, 400);
            const sources = [];
            for (const input of sourcesInput) {
              sources.push(
                await safe.assertSafeExistingMutation(
                  await policy.assertExistingPathAllowed(user, input),
                ),
              );
            }
            const destinationDirectory = await safe.assertSafeDirectory(
              await policy.assertDirectoryPathAllowed(user, body.destination),
            );
            const format =
              body.format === "tar.gz" ? "tar.gz" : body.format === "zip" ? "zip" : null;
            if (!format) return json({ error: "Unsupported archive format" }, 400);
            const archives = await archiveRuntime();
            return json(
              await archives.createArchive({
                sources,
                destinationDirectory,
                name: body.name,
                format,
              }),
              201,
            );
          }

          if (action === "archive-extract") {
            const archive = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.archive),
            );
            const destinationDirectory = await safe.assertSafeDirectory(
              await policy.assertDirectoryPathAllowed(user, body.destination),
            );
            const mode =
              body.mode === "subfolder" ? "subfolder" : body.mode === "here" ? "here" : null;
            const conflict = ["skip", "replace", "keep-both"].includes(String(body.conflict))
              ? (body.conflict as "skip" | "replace" | "keep-both")
              : null;
            if (!mode || !conflict) return json({ error: "Invalid extraction options" }, 400);
            const archives = await archiveRuntime();
            return json(
              await archives.extractArchive({ archive, destinationDirectory, mode, conflict }),
            );
          }

          if (action === "trash-restore") {
            const trash = await api.listTrash(user);
            const item = trash.items.find((candidate) => candidate.id === String(body.id || ""));
            if (!item) return json({ error: "Trash item not found" }, 404);
            const destination = await policy.assertDestinationPathAllowed(user, item.originalPath);
            await safe.assertSafeDestination(destination);
            return json(await api.restoreTrashItem(user, body.id));
          }

          if (action === "trash-delete")
            return json(await api.permanentlyDeleteTrashItem(user, body.id));
          if (action === "trash-empty") return json(await api.emptyTrash(user));

          if (action === "job-start") {
            const operation = String(body.operation || "");
            if (!["copy", "move", "delete"].includes(operation))
              return json({ error: "Unsupported file operation" }, 400);
            const source = await safe.assertSafeExistingMutation(
              await policy.assertExistingPathAllowed(user, body.source),
            );
            let destination: string | undefined;
            if (operation !== "delete") {
              destination = await safe.assertSafeDirectory(
                await policy.assertDirectoryPathAllowed(user, body.destination),
              );
              await policy.assertDestinationPathAllowed(
                user,
                path.join(destination, path.basename(source)),
              );
            }
            const operations = await operationRuntime();
            return json(
              {
                job: await operations.startOperationJob(
                  user.id,
                  operation as "copy" | "move" | "delete",
                  source,
                  destination,
                  ["skip", "replace", "keep-both"].includes(String(body.conflict))
                    ? (body.conflict as "skip" | "replace" | "keep-both")
                    : "error",
                ),
              },
              202,
            );
          }

          if (action === "job-cancel") {
            const operations = await operationRuntime();
            return json({ job: await operations.cancelOperationJob(user.id, body.id) });
          }

          return json({ error: "Unknown action" }, 404);
        } catch (error) {
          return handleError(error);
        }
      },
    },
  },
});
