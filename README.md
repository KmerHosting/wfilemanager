# wFileManager

**A privileged web file manager for Linux servers.**

wFileManager provides browser-based filesystem management, guarded archive handling, per-user trash, application users and roles, notifications, verified updates, automatic rollback and an administrator-only root terminal.

> Treat wFileManager like a root administration panel. Install it only on a server you control. Keep administrator accounts restricted to trusted operators.

## Installation requirements

wFileManager is intentionally strict. A production installation must meet these requirements before the installer continues:

- Ubuntu 20.04 LTS or newer; Ubuntu 24.04 LTS recommended.
- KVM virtual machine, bare-metal server, or LXC container with systemd and root access.
- `amd64` or `arm64` architecture.
- A domain whose A record points to the public IPv4 address of the target server.
- Public ports `80` and `443` open.
- Working `systemd`, `nginx`, `certbot`, `curl`, `jq`, `tar`, `gzip`, `xz`, `unzip`, `openssl`, build tools and Bun runtime installed or installable by apt.

Installation by raw IP address or plain HTTP is not supported. The installer validates DNS, configures HTTPS and keeps the internal application port bound to localhost.

## Official installation

Point your domain's A record to the public IPv4 address of the server where wFileManager will be installed. Wait until the domain resolves to that address, then run the official installer as root:

```bash
curl -fsSL https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/install.sh | sudo bash
```

The installer asks for:

1. the public domain;
2. the application-data plan;
3. Pro creation, recovery or remote deletion action when Pro managed data is selected.

After installation, open:

```text
https://your-domain.example/setup
```

The setup screen creates the first wFileManager administrator. This is an application account, not a Linux user. Terminal access uses the same application password and requires re-confirmation.

The first administrator password must contain at least 12 alphanumeric characters, uppercase, lowercase and a number. Identical consecutive characters are rejected.

## Editions and data storage

The edition controls where wFileManager stores its own application records: users, roles, sessions, authentication records, notifications, settings and internal metadata. It does not back up the files displayed by the file manager.

Community and Pro expose the same file-manager features. The difference is where application data is stored and who is responsible for recovery.

### Community — SQLite on your server

Community is free forever. It does not require a paid licence, subscription or activation token.

Application records are stored locally in:

```text
/var/lib/wfilemanager/wfilemanager.db
```

The server administrator is responsible for SQLite backups, restore, migration, local disk availability and recovery after a server reinstall or replacement.

### Pro — managed application data

Pro costs **$50 USD per instance per year** and includes **100 MB** of managed application storage.

Pro manages wFileManager application records separately from the server:

- users, roles and permissions;
- sessions and authentication records;
- notifications and settings;
- managed backup and recovery metadata.

Each additional **100 MB** of managed application storage costs **$1 USD per year**.

Pro does not include server filesystem files, directories, databases, uploads or other server content. Those require a separate server backup.

For Pro activation, renewal or storage expansion, contact:

```text
support@kmerhosting.com
```

## Pro activation, renewal and suspension

New Pro installations require a paid activation token during `/setup`. The support team creates the token after payment confirmation. The token is used once and then claimed by the instance.

Renewal does not require a new setup token. After payment, support extends the instance `paid_until` date in the managed backend.

Pro lifecycle:

```text
paid_until valid        access allowed
paid_until expired      grace period
+7 unpaid days          access suspended
+30 unpaid days         managed app data and account deleted
```

If managed storage reaches its quota, access is blocked with a clear message asking the customer to contact support to increase the Pro quota.

## Pro Recovery Kit

A Pro instance creates a root-only Recovery Kit at:

```text
/root/wfilemanager-recovery-kit.txt
```

Copy this file to a secure location outside the server. It contains the instance identity, recovery key and configured domain required to reconnect a replacement installation.

Display or export the current kit:

```bash
sudo wfilemanager-recovery-kit show
sudo wfilemanager-recovery-kit export /root/wfilemanager-recovery-kit.txt
```

A successful recovery rotates the recovery key, rotates heartbeat credentials and revokes previous application sessions. Recovery does not restore server filesystem files.

## Main features

- Linux filesystem browsing from `/`.
- Multi-selection, copy, move, rename and delete operations.
- Uploads and downloads with progress.
- Text preview and editing.
- ZIP and TAR.GZ creation and guarded extraction.
- Protection against traversal, unsafe links, special archive entries and excessive expansion.
- Per-user trash, restore and permanent deletion.
- Application users, roles and permissions.
- Sessions, notifications and presence.
- Administrator-only root PTY terminal with current-password verification.
- Stable updates with checksum verification, health checks and rollback.
- Pro plan display with days left, next payment date, order reference and managed storage usage.

Application users are not Linux users. Creating an account, signing in or changing an application password never creates an operating-system account and never grants sudo access.

## Administration commands

Service status:

```bash
sudo systemctl status wfilemanager.service --no-pager
```

Service logs:

```bash
sudo journalctl -u wfilemanager.service -f
```

Application health:

```bash
curl -fsS http://127.0.0.1:1973/api/health
```

Pro heartbeat status:

```bash
sudo systemctl status wfilemanager-heartbeat.timer --no-pager
sudo systemctl start wfilemanager-heartbeat.service
```

Reset an administrator password:

```bash
sudo wfilemanager-reset-admin-password
```

Update the application:

```bash
sudo /usr/local/lib/wfilemanager/update.sh install
```

Or through systemd:

```bash
sudo systemctl start wfilemanager-updater@install.service
```

Roll back to the previous verified release:

```bash
sudo systemctl start wfilemanager-updater@rollback.service
```

Read update state:

```bash
cat /var/lib/wfilemanager/update/state.json | jq .
```

Uninstall wFileManager:

```bash
curl -fsSL https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/uninstall.sh | sudo bash
```

The update system verifies the release archive, builds a separate release, switches atomically, restarts the service and checks application health. An unhealthy release is rolled back automatically.

Production updates run build, typecheck and health check. Release tests are skipped by default during server updates. To force tests during an update, set:

```bash
WFILEMANAGER_RUN_RELEASE_TESTS=true sudo /usr/local/lib/wfilemanager/update.sh install
```

## Uninstall behavior

Community uninstall removes the local SQLite installation and local service files. There is no remote managed data to delete.

Pro uninstall offers local-only removal and permanent remote deletion. Local-only removal keeps the Pro subscription data for recovery. Permanent deletion removes managed application records and requires explicit confirmation.

If remote Pro deletion fails, the uninstaller stops before deleting local recovery material.

## Persistent locations

```text
/opt/wfilemanager/                    Application releases
/etc/wfilemanager/                    Configuration and recovery keys
/var/lib/wfilemanager/                SQLite, trash and update state
/root/wfilemanager-recovery-kit.txt   Pro recovery kit
/usr/local/lib/wfilemanager/          Updater and heartbeat helpers
/usr/local/sbin/wfilemanager-*        Administration commands
/etc/nginx/sites-available/wfilemanager
```

## Security essentials

- Port `1973` remains bound to `127.0.0.1`.
- Public access is HTTPS-only through Nginx.
- Community SQLite sessions are validated locally by privileged API operations.
- Repeated sign-in failures are rate-limited by account and source IP.
- Ordinary application users never receive Linux or sudo accounts.
- Terminal endpoints require an administrator and current-password verification.
- Mutations through symbolic-link path components are rejected.
- Writes to `/proc`, `/sys`, `/dev` and `/run` are blocked by default.
- Uploads never replace an existing destination.
- Archive entry count, expanded size, compression ratio and destination free space are checked.
- Release archives are verified by size and SHA-256 before activation.
- Recovery keys, heartbeat secrets and exported Recovery Kits are stored with root-only permissions.
- Pro routine heartbeats use a dedicated instance secret. Recovery keys are reserved for recovery operations and legacy fallback.

Read [SECURITY.md](./SECURITY.md) before reporting a vulnerability.

## Development

Requirements: Node.js 24, Bun, Python 3 and Linux.

```bash
git clone https://github.com/toscani-tenekeu/wFileManager.git
cd wFileManager
cp .env.example .env
bun install
bun run dev
```

Verification:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

Example Community SQLite configuration:

```env
VITE_WFILEMANAGER_DATABASE_MODE=sqlite
WFILEMANAGER_DATABASE_MODE=sqlite
WFILEMANAGER_SQLITE_PATH=./data/wfilemanager.db
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Support

```text
support@kmerhosting.com
```

Developed by KmerHosting LLC.
