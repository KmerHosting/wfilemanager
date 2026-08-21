# Security

> [!WARNING]
> wFileManager normally runs as `root`. Access to the admin account should be treated as server-level access.

## Supported version

Only the latest stable release is supported. Install security updates promptly.

## Report a vulnerability

Report security issues privately to:

```text
support@kmerhosting.com
```

Include the wFileManager version, Ubuntu version, impact and minimal reproduction steps. Do not send passwords, private keys, customer files or production databases.

## Reset admin password

```bash
sudo wfilemanager-reset-admin-password
```

This revokes existing sessions.
