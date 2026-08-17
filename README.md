<h1 align="center">wFileManager</h1>

<p align="center">
  A small, self-hosted web file manager for Linux servers.
</p>

wFileManager runs directly on your server, stores its application state in local SQLite and has one
administrator account. It does not require a licence key, hosted database, domain name or external
identity service.

## Core features

- Browse the real Linux filesystem.
- Create files and folders.
- Upload and download files.
- Edit text files in the browser.
- Rename, copy and move files and folders.
- Move items to trash, restore them or permanently delete them.
- One local administrator account (`admin`).
- Local SQLite application state.
- Verified prebuilt updates with atomic activation and rollback.
- Shell command to reset the administrator password.

wFileManager intentionally does not include application users, roles, a web terminal, notification
center, audit-log UI, task center, hosted data plans or server-side build tooling.

## Install

Requirements:

- Ubuntu 20.04 LTS or newer
- root access
- systemd
- network access to download the stable release

```bash
curl -fsSL https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/install.sh | sudo bash
```

The installer downloads a verified prebuilt release. It does not install Bun, a C/C++ build toolchain,
Nginx or Certbot and does not require DNS to be configured first.

The default service listens on port `1973`. After installation, open:

```text
http://SERVER_IP:1973/setup
```

Create the administrator password and wFileManager is ready.

If the service is exposed to the Internet, put it behind HTTPS using your preferred reverse proxy,
load balancer, tunnel or web server.

## Data

Application state is stored at:

```text
/var/lib/wfilemanager/wfilemanager.db
```

The files managed through File Explorer remain in their normal Linux filesystem locations. Back up
the SQLite database and important server files according to your own backup policy.

## Operations

Service status:

```bash
sudo systemctl status wfilemanager.service --no-pager
```

Logs:

```bash
sudo journalctl -u wfilemanager.service -f
```

Health check:

```bash
curl -fsS http://127.0.0.1:1973/api/health
```

Reset the only administrator password:

```bash
sudo wfilemanager-reset-admin-password
```

Install the latest verified stable release:

```bash
sudo systemctl start wfilemanager-updater@install.service
```

Rollback to the previous release:

```bash
sudo systemctl start wfilemanager-updater@rollback.service
```

Remove wFileManager and its application data:

```bash
sudo wfilemanager-uninstall
```

## Development

Development uses Bun, but production installations do not.

```bash
bun install --frozen-lockfile
bun run dev
```

Checks:

```bash
bun run test
bun run typecheck
bun run build
bun run lint
```

## License

MIT. Security reports: `support@kmerhosting.com`.
