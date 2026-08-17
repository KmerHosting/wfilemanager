# Security Policy

wFileManager is a privileged Linux file-management application. The production service runs as
`root`, so compromise of the application or administrator account may compromise the server.

## Supported versions

| Version         | Support                       |
| --------------- | ----------------------------- |
| Latest stable   | Supported                     |
| Previous stable | Critical fixes when practical |
| Older versions  | Not supported                 |
| `main`          | Development only              |

Install stable security updates promptly.

## Report vulnerabilities privately

Do not publish an unpatched vulnerability in an issue, discussion, pull request or social-media post.

Email:

```text
support@kmerhosting.com
```

Suggested subject:

```text
SECURITY: short description
```

Include the affected wFileManager version, Ubuntu version, impact, reproduction steps and sanitized
logs. Never send real passwords, private keys, customer files or a production SQLite database.

## Important security areas

Reports are especially relevant for:

- administrator authentication bypass;
- arbitrary filesystem access beyond the intended authenticated administrator boundary;
- path traversal, symlink or race-condition attacks;
- unsafe writes to `/proc`, `/sys`, `/dev` or `/run`;
- session or password exposure;
- update verification or rollback bypass;
- persistent XSS in authenticated pages;
- CSRF or cross-origin request bypass;
- unsafe handling of the local SQLite database.

Expected filesystem access by the authenticated administrator is not a vulnerability by itself.

## Safe testing

Test only systems and data you own or have explicit permission to test. Do not interrupt production,
perform destructive tests, cause resource exhaustion, deploy malware, use social engineering or
publicly disclose an unpatched issue.

## Deployment

wFileManager can run directly on port `1973` without a domain or reverse proxy. For regular Internet
exposure, HTTPS is strongly recommended. You may provide it with Nginx, Caddy, Apache, Traefik,
Cloudflare Tunnel, a load balancer or another trusted reverse proxy.

Protect:

- SSH and root access;
- `/etc/wfilemanager`;
- `/var/lib/wfilemanager/wfilemanager.db`;
- the administrator password;
- server backups.

Apply Ubuntu and wFileManager security updates promptly.

## Authentication

There is exactly one wFileManager account:

```text
admin
```

There is no user-registration system, secondary user, role engine or browser password-recovery flow.
Administrator passwords require at least 12 alphanumeric characters, uppercase, lowercase and a
number, with no identical consecutive characters. Validation occurs on the server.

Reset the administrator password from a root shell:

```bash
sudo wfilemanager-reset-admin-password
```

A shell password reset revokes all existing wFileManager sessions.

## Application data

Application state is stored locally at:

```text
/var/lib/wfilemanager/wfilemanager.db
```

The SQLite file and `/etc/wfilemanager` must remain root-only. Files managed through File Explorer
remain in their original filesystem locations and require an independent backup strategy.

## Filesystem and update protections

Do not weaken:

- path normalization and traversal rejection;
- pseudo-filesystem write blocking;
- authentication before privileged local operations;
- safe handling of symlinks and destinations;
- HTTPS release downloads;
- SHA-256 and archive-size verification;
- versioned releases, atomic activation, health checks and rollback.

Production clients install prebuilt releases and do not execute package-manager or application build
steps during updates.

## Secrets

Never commit or publish:

- session tokens;
- administrator password hashes or salts;
- `.env` files with secrets;
- SQLite databases or production dumps;
- SSH private keys or customer files.

Rotate exposed secrets immediately. Removing a secret from the latest commit does not remove it from
Git history, logs, caches or forks.
