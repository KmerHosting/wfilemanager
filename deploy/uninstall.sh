#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "Run this command as root." >&2; exit 1; }
[[ $# -eq 0 ]] || { echo "Usage: sudo wfilemanager-uninstall" >&2; exit 2; }

cat <<'TEXT'
wFileManager uninstaller

This removes:
- the wFileManager service and updater
- application releases and configuration
- the local SQLite database
- the private wFileManager trash directory

It does NOT remove Node.js or other system packages.
It does NOT delete normal server files managed through File Explorer.
TEXT

read -r -p "Type REMOVE to continue: " CONFIRM </dev/tty
[[ "$CONFIRM" == "REMOVE" ]] || { echo "Cancelled."; exit 0; }

systemctl disable --now wfilemanager.service 2>/dev/null || true
systemctl disable --now wfilemanager-updater@install.service 2>/dev/null || true
systemctl disable --now wfilemanager-updater@rollback.service 2>/dev/null || true

rm -f \
  /etc/systemd/system/wfilemanager.service \
  /etc/systemd/system/wfilemanager-updater@.service \
  /etc/systemd/system/wfilemanager.service.d/10-root-terminal.conf
rmdir --ignore-fail-on-non-empty /etc/systemd/system/wfilemanager.service.d 2>/dev/null || true
systemctl daemon-reload
systemctl reset-failed 2>/dev/null || true

rm -rf /opt/wfilemanager /etc/wfilemanager /var/lib/wfilemanager /usr/local/lib/wfilemanager
rm -f \
  /usr/local/sbin/wfilemanager-reset-admin-password \
  /usr/local/sbin/wfilemanager-doctor \
  /usr/local/sbin/wfilemanager-uninstall

echo "wFileManager was removed."
