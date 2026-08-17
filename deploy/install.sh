#!/usr/bin/env bash
set -Eeuo pipefail

MANIFEST_URL="${WFILEMANAGER_UPDATE_MANIFEST_URL:-https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/stable.json}"
PORT="${PORT:-1973}"
APP_ROOT="/opt/wfilemanager"
CONFIG_DIR="/etc/wfilemanager"
ENV_FILE="$CONFIG_DIR/wfilemanager.env"
STATE_ROOT="/var/lib/wfilemanager"
HEALTH_URL="http://127.0.0.1:$PORT/api/health"

[[ $EUID -eq 0 ]] || { echo "Run this installer with sudo or as root." >&2; exit 1; }
[[ -r /etc/os-release ]] || { echo "Unable to identify the operating system." >&2; exit 1; }
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || { echo "wFileManager currently supports Ubuntu only." >&2; exit 1; }
dpkg --compare-versions "${VERSION_ID:-0}" ge 20.04 || { echo "Ubuntu 20.04 LTS or newer is required." >&2; exit 1; }
[[ "$(ps -p 1 -o comm= 2>/dev/null | tr -d '[:space:]')" == "systemd" ]] || {
  echo "systemd must be PID 1." >&2
  exit 1
}

APT_OPTIONS=(-o Acquire::Retries=3 -o Acquire::http::Timeout=45 -o Acquire::https::Timeout=45)
BASE_PACKAGES=(curl ca-certificates jq tar gzip xz-utils openssl util-linux)
apt-get "${APT_OPTIONS[@]}" update
DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get "${APT_OPTIONS[@]}" install -y "${BASE_PACKAGES[@]}"

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])' 2>/dev/null || echo 0)" -lt 24 ]]; then
  echo "Installing Node.js 24 runtime..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get "${APT_OPTIONS[@]}" install -y nodejs
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(`.`)[0])')"
[[ "$NODE_MAJOR" -ge 24 ]] || { echo "Node.js 24 or newer is required." >&2; exit 1; }

install -d -m 755 "$APP_ROOT/releases" "$CONFIG_DIR" /usr/local/lib/wfilemanager
install -d -m 700 "$STATE_ROOT" "$STATE_ROOT/trash" "$STATE_ROOT/update"

EXISTING_INSTANCE_KEY=""
if [[ -f "$ENV_FILE" ]]; then
  EXISTING_INSTANCE_KEY="$(sed -n 's/^WFILEMANAGER_INSTANCE_KEY=//p' "$ENV_FILE" | tail -n1)"
fi
INSTANCE_KEY="${WFILEMANAGER_INSTANCE_KEY:-$EXISTING_INSTANCE_KEY}"
[[ -n "$INSTANCE_KEY" ]] || INSTANCE_KEY="wfm-$(openssl rand -hex 8)"

umask 077
cat >"$ENV_FILE" <<ENV
PORT=$PORT
HOST=0.0.0.0
WFILEMANAGER_DATABASE_MODE=sqlite
VITE_WFILEMANAGER_DATABASE_MODE=sqlite
VITE_WFILEMANAGER_INSTANCE_KEY=$INSTANCE_KEY
WFILEMANAGER_INSTANCE_KEY=$INSTANCE_KEY
WFILEMANAGER_SQLITE_PATH=$STATE_ROOT/wfilemanager.db
WFILEMANAGER_ALLOW_PSEUDO_FS_WRITE=false
WFILEMANAGER_TRASH_DIR=$STATE_ROOT/trash
WFILEMANAGER_STATE_ROOT=$STATE_ROOT
WFILEMANAGER_UPDATE_MANIFEST_URL=$MANIFEST_URL
WFILEMANAGER_UPDATE_STATE_FILE=$STATE_ROOT/update/state.json
WFILEMANAGER_UPDATE_SCRIPT=/usr/local/lib/wfilemanager/update.sh
WFILEMANAGER_HEALTH_URL=$HEALTH_URL
WFILEMANAGER_SERVICE=wfilemanager.service
ENV
if [[ -n "${WFILEMANAGER_PUBLIC_BASE_URL:-}" ]]; then
  printf 'WFILEMANAGER_PUBLIC_BASE_URL=%s\n' "$WFILEMANAGER_PUBLIC_BASE_URL" >>"$ENV_FILE"
fi
chmod 600 "$ENV_FILE"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL --retry 3 "$MANIFEST_URL" -o "$TMP/stable.json"

verify_asset() {
  local url="$1" sha="$2" destination="$3"
  [[ "$url" == https://* && "$sha" =~ ^[a-fA-F0-9]{64}$ ]] || {
    echo "The stable manifest contains an invalid asset." >&2
    exit 1
  }
  curl -fsSL --retry 3 --connect-timeout 15 "$url" -o "$destination"
  printf '%s  %s\n' "${sha,,}" "$destination" | sha256sum -c -
}

UPDATER_ASSET="$(jq -r '.assets.updater // empty' "$TMP/stable.json")"
UPDATER_SHA="$(jq -r '.assets.updaterSha256 // empty' "$TMP/stable.json")"
UPDATER_SERVICE_URL="$(jq -r '.assets.updaterService // empty' "$TMP/stable.json")"
UPDATER_SERVICE_SHA="$(jq -r '.assets.updaterServiceSha256 // empty' "$TMP/stable.json")"
APP_SERVICE_URL="$(jq -r '.assets.appService // empty' "$TMP/stable.json")"
APP_SERVICE_SHA="$(jq -r '.assets.appServiceSha256 // empty' "$TMP/stable.json")"

verify_asset "$UPDATER_ASSET" "$UPDATER_SHA" /usr/local/lib/wfilemanager/update.sh
verify_asset "$UPDATER_SERVICE_URL" "$UPDATER_SERVICE_SHA" /etc/systemd/system/wfilemanager-updater@.service
verify_asset "$APP_SERVICE_URL" "$APP_SERVICE_SHA" /etc/systemd/system/wfilemanager.service
chmod 750 /usr/local/lib/wfilemanager/update.sh

systemctl daemon-reload
systemctl enable wfilemanager.service
/usr/local/lib/wfilemanager/update.sh install

CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current")"
install -m 700 "$CURRENT_RELEASE/deploy/wfilemanager-reset-admin-password" /usr/local/sbin/wfilemanager-reset-admin-password
install -m 700 "$CURRENT_RELEASE/deploy/uninstall.sh" /usr/local/sbin/wfilemanager-uninstall

systemctl enable --now wfilemanager.service

READY=false
for _ in $(seq 1 30); do
  if systemctl is-active --quiet wfilemanager.service && curl -fsS --max-time 5 "$HEALTH_URL" | jq -e '.ok == true' >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done
if [[ "$READY" != "true" ]]; then
  journalctl -u wfilemanager.service -n 100 --no-pager >&2 || true
  exit 1
fi

SERVER_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
OPEN_HOST="${SERVER_IP:-SERVER_IP}"
OPEN_PATH="setup"
[[ -n "$EXISTING_INSTANCE_KEY" ]] && OPEN_PATH="login"

echo
echo "wFileManager installed successfully."
echo "Open: http://$OPEN_HOST:$PORT/$OPEN_PATH"
echo "Account model: single administrator"
echo "Database: $STATE_ROOT/wfilemanager.db"
echo
echo "A domain, Nginx and HTTPS are optional and are no longer installed automatically."
echo "If this port is exposed to the Internet, place wFileManager behind HTTPS before regular use."
echo
echo "Reset the administrator password with:"
echo "  sudo wfilemanager-reset-admin-password"
echo
echo "Remove wFileManager with:"
echo "  sudo wfilemanager-uninstall"
