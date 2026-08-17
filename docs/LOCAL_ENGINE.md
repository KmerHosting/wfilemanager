# Local engine

wFileManager is a local Node.js application backed by SQLite.

## Account model

There is exactly one application account:

```text
admin
```

The account is stored locally and is not a Linux user. There are no secondary users, custom roles,
path ACLs or hosted identities. The administrator can access the filesystem exposed by the
wFileManager service process, subject to the built-in safety rules that protect pseudo-filesystems and
the private trash directory.

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
