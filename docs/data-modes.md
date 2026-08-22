# Application data

wFileManager has one data mode: local SQLite.

The database is stored at:

```text
/var/lib/wfilemanager/wfilemanager.db
```

It contains local user accounts, their sessions and minimal application metadata.
There are no hosted data plans, product wallets, licences or custom roles.

Filesystem content is not copied into SQLite. Websites, uploads, mounted volumes, databases and other
server files remain in their normal Linux locations.

The server operator is responsible for backups and disaster recovery of both the SQLite database and
important filesystem content.
