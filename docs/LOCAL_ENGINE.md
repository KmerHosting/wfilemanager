# Local engine

wFileManager is a local Node.js application backed by SQLite.

## Account model

The first-run setup creates the local `admin` account. Administrators can create, suspend, delete and
reset passwords for additional local users from **Account**. Standard users can perform the same file
operations as the administrator but cannot access account-management APIs.

These accounts are stored locally and are not Linux users. All file access remains subject to the
built-in safety rules that protect pseudo-filesystems and the private trash directory. Suspending,
deleting or resetting a user immediately revokes that user's sessions.

Because every account has the same file access, Trash is shared. Each item records who deleted it,
and the existing administrator trash remains available after this upgrade.

The administrator password can be reset from the server shell with:

```bash
sudo wfilemanager-reset-admin-password
```

## File operations

The local engine supports:

- directory listing and search
- text-file reading and saving
- file and directory creation
- upload and download
- rename
- copy and move
- trash, restore and permanent deletion
- server overview

Large copy and move operations use internal jobs so the HTTP request does not need to remain open for
the entire filesystem operation. The jobs are an implementation detail and there is no separate task
center in the UI.

## Storage

Application state:

```text
/var/lib/wfilemanager/wfilemanager.db
```

Private trash:

```text
/var/lib/wfilemanager/trash
```

No user data is stored in a hosted wFileManager database.

## Runtime

The production service runs the prebuilt Node output:

```text
/opt/wfilemanager/current/.output/server/index.mjs
```

Production servers do not build the application and do not require Bun, TypeScript, Vite,
`build-essential`, `node-gyp` or a web-terminal native module.
