#!/usr/bin/env bash
set -Eeuo pipefail

[[ "${EUID:-$(id -u)}" -eq 0 ]] || { echo "Run this command as root." >&2; exit 1; }
[[ $# -eq 0 ]] || { echo "Usage: sudo wfilemanager-uninstall" >&2; exit 2; }

APP_ROOT="/opt/wfilemanager"
CONFIG_DIR="/etc/wfilemanager"
ENV_FILE="$CONFIG_DIR/wfilemanager.env"
STATE_ROOT="/var/lib/wfilemanager"
PORT="1973"
if [[ -f "$ENV_FILE" ]]; then
  CONFIGURED_PORT="$(sed -n 's/^PORT=//p' "$ENV_FILE" | tail -n1)"
  [[ "$CONFIGURED_PORT" =~ ^[0-9]+$ ]] && PORT="$CONFIGURED_PORT"
fi

declare -a NGINX_CONFIGS=()
declare -a CERTIFICATE_NAMES=()

add_unique() {
  local array_name="$1" value="$2" existing=""
  local -n values="$array_name"
  for existing in "${values[@]:-}"; do
    [[ "$existing" == "$value" ]] && return
  done
  values+=("$value")
}

dedicated_wfilemanager_config() {
  local file="$1" name proxy_count matching_proxy_count server_count
  name="${file##*/}"
  if [[ "${name,,}" == *wfilemanager* ]]; then
    return 0
  fi
  matching_proxy_count="$(grep -Eic "^[[:space:]]*proxy_pass[[:space:]]+https?://(127\\.0\\.0\\.1|localhost):${PORT}([/;[:space:]]|$)" "$file" 2>/dev/null || true)"
  proxy_count="$(grep -Eic '^[[:space:]]*proxy_pass[[:space:]]+' "$file" 2>/dev/null || true)"
  server_count="$(grep -Eic '^[[:space:]]*server[[:space:]]*\{' "$file" 2>/dev/null || true)"
  [[ "$matching_proxy_count" -gt 0 && "$proxy_count" -eq "$matching_proxy_count" && "$server_count" -le 1 ]]
}

discover_nginx_assets() {
  local directory candidate target certificate_path relative certificate_name
  [[ -d /etc/nginx ]] || return
  for directory in /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d; do
    [[ -d "$directory" ]] || continue
    while IFS= read -r -d '' candidate; do
      target="$(readlink -f -- "$candidate" 2>/dev/null || true)"
      [[ -n "$target" && -f "$target" ]] || continue
      dedicated_wfilemanager_config "$target" || continue
      add_unique NGINX_CONFIGS "$candidate"
      [[ "$target" == /etc/nginx/* ]] && add_unique NGINX_CONFIGS "$target"
      while IFS= read -r certificate_path; do
        case "$certificate_path" in
          /etc/letsencrypt/live/*/*)
            relative="${certificate_path#/etc/letsencrypt/live/}"
            certificate_name="${relative%%/*}"
            if [[ "$certificate_name" =~ ^[A-Za-z0-9._-]+$ && "$certificate_name" != "." && "$certificate_name" != ".." ]]; then
              add_unique CERTIFICATE_NAMES "$certificate_name"
            fi
            ;;
        esac
      done < <(sed -nE 's/^[[:space:]]*ssl_certificate(_key)?[[:space:]]+([^;[:space:]]+).*/\2/p' "$target")
    done < <(find "$directory" -maxdepth 1 \( -type f -o -type l \) -print0 2>/dev/null)
  done
}

certificate_still_referenced() {
  local certificate_name="$1"
  grep -rqsF --exclude-dir=letsencrypt -- "/etc/letsencrypt/live/$certificate_name/" /etc 2>/dev/null
}

discover_nginx_assets

cat <<'TEXT'
wFileManager uninstaller

This removes:
- all wFileManager services, releases, configuration, state, database and trash
- the wFileManager firewall rule
- dedicated Nginx configurations that proxy only to wFileManager
- unshared Let's Encrypt certificates referenced by those configurations

It does NOT remove Node.js, Nginx, Certbot or other system packages.
It does NOT delete normal server files managed through File Explorer.
Shared Nginx configurations and certificates remain installed.
TEXT

if [[ "${#NGINX_CONFIGS[@]}" -gt 0 ]]; then
  echo
  echo "Nginx files scheduled for removal:"
  printf '  %s\n' "${NGINX_CONFIGS[@]}"
fi
if [[ "${#CERTIFICATE_NAMES[@]}" -gt 0 ]]; then
  echo
  echo "Certificates scheduled for removal when not referenced elsewhere:"
  printf '  %s\n' "${CERTIFICATE_NAMES[@]}"
fi

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

if command -v ufw >/dev/null 2>&1; then
  ufw --force delete allow "$PORT/tcp" >/dev/null 2>&1 || true
fi

if [[ "${#NGINX_CONFIGS[@]}" -gt 0 ]]; then
  rm -f -- "${NGINX_CONFIGS[@]}"
fi

if command -v nginx >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  if nginx -t >/dev/null 2>&1; then
    systemctl reload nginx
  else
    echo "Warning: the remaining Nginx configuration is invalid; Nginx was not reloaded." >&2
  fi
fi

if [[ "${#CERTIFICATE_NAMES[@]}" -gt 0 ]]; then
  for certificate_name in "${CERTIFICATE_NAMES[@]}"; do
    if certificate_still_referenced "$certificate_name"; then
      echo "Keeping shared certificate: $certificate_name"
      continue
    fi
    if command -v certbot >/dev/null 2>&1; then
      certbot delete --cert-name "$certificate_name" --non-interactive >/dev/null 2>&1 || true
    fi
    rm -rf -- \
      "/etc/letsencrypt/live/$certificate_name" \
      "/etc/letsencrypt/archive/$certificate_name"
    rm -f -- "/etc/letsencrypt/renewal/$certificate_name.conf"
  done
fi

rm -rf -- \
  "$APP_ROOT" \
  "$CONFIG_DIR" \
  "$STATE_ROOT" \
  /usr/local/lib/wfilemanager \
  /run/wfilemanager \
  /var/cache/wfilemanager \
  /var/log/wfilemanager
rm -f -- \
  /usr/local/sbin/wfilemanager-reset-admin-password \
  /usr/local/sbin/wfilemanager-doctor \
  /usr/local/sbin/wfilemanager-uninstall

echo "wFileManager and its dedicated integration files were removed."
