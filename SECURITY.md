# Security Policy

wFileManager is a privileged Linux application and normally runs as `root`. Treat access to the `admin` account as server-level access.

## Supported versions

Only the latest stable release is fully supported. Install security updates promptly.

## Report a vulnerability

Report privately to:

```text
support@kmerhosting.com
```

Include the affected wFileManager version, Ubuntu version, impact and minimal reproduction steps. Do not send real passwords, private keys, customer files or production databases.

Do not disclose an unpatched vulnerability publicly.

## Security expectations

Do not weaken:

- single-admin authentication and session protection;
- filesystem path validation;
- write restrictions for `/proc`, `/sys`, `/dev` and `/run`;
- safe symlink and destination handling;
- release SHA-256 verification, atomic activation and rollback;
- root-only protection of `/etc/wfilemanager` and `/var/lib/wfilemanager`.

For regular Internet exposure, use HTTPS through a trusted reverse proxy, tunnel or load balancer.

Reset the administrator password from the server with:

```bash
sudo wfilemanager-reset-admin-password
```

This revokes existing sessions.
