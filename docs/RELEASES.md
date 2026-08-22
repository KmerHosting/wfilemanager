# wFileManager release procedure

## 0.11.11

- Replaced Carbon-focused authentication copy with a concise file-manager feature summary.
- Removed the one-pixel condensed-grid gutter from the authentication screen edges.
- Kept the authentication layout on Carbon Grid and Column components.
- Replaced Accessible paths and Trash overview cards with root storage and memory usage.
- Removed the redundant account-model row from About.

## 0.11.10

- Fixed legitimate same-origin sign-in requests being rejected on direct IP access.
- Improved origin reconstruction for deployments using forwarded host and protocol headers.
- Expanded the uninstaller to remove the dedicated firewall rule, Nginx configuration and unshared Let's Encrypt certificates.
- Kept shared web-server configuration, shared certificates, Nginx, Certbot and Node.js protected.

## 0.11.9

- Reworked File Explorer selection and keyboard behavior to match familiar desktop file managers.
- Added context actions, multi-item copy/move/trash, destination browsing and conflict policies.
- Added sortable directory details, server-side search pagination, hidden files and drag-and-drop upload.
- Added ZIP/TAR.GZ creation and safe libarchive-based extraction for ZIP/TAR/RAR/7z formats.
- Added media previews and editable Linux mode, UID and GID properties.
- Removed the obsolete duplicate in-memory operation-job implementation.

wFileManager production servers install prebuilt releases. They never run `bun install`, TypeScript,
Vite or a local application build.

## Release pipeline

1. CI validates the source on `main`.
2. GitHub Actions installs development dependencies and builds the production `.output` directory.
3. The workflow packages `.output`, `package.json` and the deployment scripts into
   `wfilemanager-VERSION.tar.gz`.
4. SHA-256 and archive size are published with the GitHub release.
5. The stable release channel is synchronized only after the GitHub release exists.
6. Production clients download those exact prebuilt bytes.

## Client update

```bash
sudo systemctl start wfilemanager-updater@install.service
sudo journalctl -u wfilemanager-updater@install.service -f
```

The updater performs only:

```text
download → verify → extract → atomic switch → restart → health check
```

A failed health check restores the previous release automatically.

## Rollback

```bash
sudo systemctl start wfilemanager-updater@rollback.service
```

Two releases are retained locally by default: current and previous.
