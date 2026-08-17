<div align="center">

# wFileManager

**A small, self-hosted web file manager for Linux servers.**

![React](https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Ubuntu](https://img.shields.io/badge/Ubuntu-20.04+-E95420?logo=ubuntu&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

wFileManager gives one administrator direct browser access to the server filesystem. It is intentionally simple: no hosted database, roles, secondary users, licence service or web terminal.

## Features

- Browse, upload, download and edit files.
- Create, rename, copy and move files or folders.
- Trash, restore and permanently delete items.
- One local `admin` account.
- Local SQLite state.
- Prebuilt verified updates with rollback.
- CLI password reset and diagnostics.

## Requirements

- Ubuntu 20.04 LTS or newer
- root access
- systemd
- Internet access for installation and updates

## Install

```bash
curl -fsSL https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/install.sh | sudo bash
```

The installer downloads a prebuilt release and starts wFileManager on TCP `1973`. No domain, Nginx, Certbot, Bun or build toolchain is required.

After installation, open the URL printed by the installer and enter the one-time setup code shown in the terminal.

For regular Internet use, place wFileManager behind HTTPS.

## Commands

```bash
sudo wfilemanager-doctor
sudo wfilemanager-reset-admin-password
sudo systemctl status wfilemanager.service --no-pager
sudo journalctl -u wfilemanager.service -f
sudo systemctl start wfilemanager-updater@install.service
sudo systemctl start wfilemanager-updater@rollback.service
sudo wfilemanager-uninstall
```

Application state:

```text
/var/lib/wfilemanager/wfilemanager.db
```

## Development

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run typecheck
bun run lint
bun run build
```

Documentation: https://kmerhosting.com/docs  
Security reports: `support@kmerhosting.com`  
License: MIT
