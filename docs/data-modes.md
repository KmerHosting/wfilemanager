# Editions, billing and data scope

wFileManager separates application records from the files managed on the server filesystem.

Application records include:

- users and roles;
- sessions and authentication information;
- notifications;
- application settings;
- related wFileManager metadata.

Files, directories, databases and other content displayed by the file manager remain on your server in both editions.

## Community — SQLite on your server

Community is free forever and does not require a paid licence or subscription.

Application records are stored locally in:

```text
/var/lib/wfilemanager/wfilemanager.db
```

You are responsible for database backups, restores, migrations, maintenance and recovery after reinstalling or replacing the server.

Community uninstall removes the local application, local SQLite records and configuration from the server. It never calls the Pro managed backend.

Community includes all wFileManager features and community support.

## Pro — Managed application data

Pro costs **$50 USD per instance per year** and includes **100 MB** of managed application storage.

Pro provides:

- managed users, roles, sessions and authentication records;
- managed notifications, settings and related application records;
- automatic backups of wFileManager application data;
- recovery tools for reconnecting a replacement installation;
- restoration of managed application records after a server reinstall;
- priority support.

Additional managed storage costs **$1 USD per 100 MB per year**.

## Pro activation and billing lifecycle

A Pro instance requires a paid activation token before the first administrator setup can complete. The token is issued after payment and is claimed by one instance.

Billing lifecycle:

- before payment: Pro setup is blocked;
- after payment: the activation token enables setup and sets the paid-through date;
- more than **7 days unpaid**: the Pro account is suspended and active sessions are revoked;
- more than **30 days unpaid**: the Pro managed application data and account are permanently deleted.

This lifecycle is based on payment status, not on server heartbeat inactivity. Missing server heartbeats do not delete paid Pro data by themselves.

## Pro uninstall choices

Pro uninstall has two separate paths:

- **local-only uninstall** removes the server installation and keeps the paid Pro managed application data and subscription for recovery;
- **permanent Pro deletion** deletes the remote managed application data and instance account, then removes the local installation.

Permanent Pro deletion requires the saved Recovery Kit. If the Recovery Kit does not match the remote account, remote deletion is rejected and the local uninstall is stopped unless the operator explicitly chooses local-only uninstall.

## Storage scope

Pro storage does not include files from the server filesystem. wFileManager is a management layer above the filesystem; it does not replace a server backup system.

Maintain an independent backup and recovery strategy for:

- user files and directories;
- website and application content;
- server databases;
- configuration outside wFileManager application records;
- mounted storage and external volumes.

## Terms of Use

Use of wFileManager is subject to the project Terms of Use in `TERMS.md` and on the official website. The Terms define edition scope, Pro payment lifecycle, uninstall behavior and operator responsibility.

## Installation requirement

Before installing wFileManager, point your domain's A record to the public IPv4 address of the target server. Wait until the domain resolves to that address, then run the official installer.

Supported deployment types include KVM virtual machines, bare-metal servers and LXC containers with systemd and root access.
