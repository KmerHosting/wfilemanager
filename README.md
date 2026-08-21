<div align="center">

# wFileManager

**A small, self-hosted web file manager for Linux servers.**

![React](https://img.shields.io/badge/React-19-20232a?logo=react&logoColor=61DAFB)
![Carbon](https://img.shields.io/badge/Carbon-Design%20System-161616)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-24+-339933?logo=nodedotjs&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-local-003B57?logo=sqlite&logoColor=white)
![Ubuntu](https://img.shields.io/badge/Ubuntu-20.04+-E95420?logo=ubuntu&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue)

</div>

### What is wFileManager?

> [!NOTE]
> wFileManager is a small self-hosted web file manager for Linux servers. It gives one administrator browser access to browse, upload, download, edit, move, rename and delete files and folders.
>
> It uses a local SQLite database and does not require a hosted database or external account service.

### Install

> [!NOTE]
> Requires Ubuntu 20.04+ with root access and Internet connectivity.
>
> ```bash
> curl -fsSL https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/install.sh | sudo bash
> ```
>
> The installer starts wFileManager on TCP port `1973`. Open the URL printed by the installer and use the one-time setup code shown in the terminal.

## Useful commands

```bash
sudo wfilemanager-doctor
sudo wfilemanager-reset-admin-password
sudo systemctl status wfilemanager.service --no-pager
sudo journalctl -u wfilemanager.service -f
sudo systemctl start wfilemanager-updater@install.service
sudo systemctl start wfilemanager-updater@rollback.service
sudo wfilemanager-uninstall
```

> [!NOTE]
> ### Notice
> wFileManager provides direct access to your server filesystem. Only install it on servers you control.
>
> Do not expose port `1973` directly to the public Internet. Put wFileManager behind HTTPS and appropriate access controls.
>
> File deletion or modification can damage applications or the operating system. Keep backups of important data.
