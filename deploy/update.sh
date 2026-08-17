#!/usr/bin/env bash
set -Eeuo pipefail

ACTION="${1:-install}"
APP_ROOT="${WFILEMANAGER_APP_ROOT:-/opt/wfilemanager}"
RELEASES_DIR="$APP_ROOT/releases"
CURRENT_LINK="$APP_ROOT/current"
CONFIG_DIR="${WFILEMANAGER_CONFIG_DIR:-/etc/wfilemanager}"
ENV_FILE="$CONFIG_DIR/wfilemanager.env"
STATE_DIR="${WFILEMANAGER_UPDATE_DIR:-/var/lib/wfilemanager/update}"
STATE_FILE="${WFILEMANAGER_UPDATE_STATE_FILE:-$STATE_DIR/state.json}"
PREVIOUS_FILE="$STATE_DIR/previous-release"
LOCK_FILE="$STATE_DIR/update.lock"
MANIFEST_URL="${WFILEMANAGER_UPDATE_MANIFEST_URL:-https://igihzeyfgwhnuiflamvn.supabase.co/storage/v1/object/public/releases.kmerhosting.com/wfilemanager/stable.json}"
SERVICE="${WFILEMANAGER_SERVICE:-wfilemanager.service}"
HEALTH_URL="${WFILEMANAGER_HEALTH_URL:-http://127.0.0.1:${PORT:-1973}/api/health}"
KEEP_RELEASES="${WFILEMANAGER_KEEP_RELEASES:-2}"
ROOT_RESET_COMMAND="${WFILEMANAGER_ROOT_RESET_COMMAND:-/usr/local/sbin/wfilemanager-reset-admin-password}"
UNINSTALL_COMMAND="${WFILEMANAGER_UNINSTALL_COMMAND:-/usr/local/sbin/wfilemanager-uninstall}"

mkdir -p "$RELEASES_DIR" "$STATE_DIR" "$CONFIG_DIR" /usr/local/lib/wfilemanager
chmod 700 "$STATE_DIR"
exec 9>"$LOCK_FILE"
flock -n 9 || { echo "Another wFileManager update is already running" >&2; exit 75; }

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

state() {
  local status="$1" progress="$2" message="$3" target="${4:-}" error="${5:-}"
  local current="" previous=""
  [[ -L "$CURRENT_LINK" ]] && current="$(basename "$(readlink -f "$CURRENT_LINK")")"
  [[ -f "$PREVIOUS_FILE" ]] && previous="$(basename "$(cat "$PREVIOUS_FILE")")"
  jq -n \
    --arg status "$status" \
    --argjson progress "$progress" \
    --arg message "$message" \
    --arg currentVersion "$current" \
    --arg targetVersion "$target" \
    --arg previousVersion "$previous" \
    --arg updatedAt "$(now)" \
    --arg error "$error" \
    --arg startedAt "${STARTED_AT:-$(now)}" \
    '{status:$status,progress:$progress,message:$message,currentVersion:($currentVersion|if length>0 then . else null end),targetVersion:($targetVersion|if length>0 then . else null end),previousVersion:($previousVersion|if length>0 then . else null end),startedAt:$startedAt,updatedAt:$updatedAt,error:($error|if length>0 then . else null end)}' \
    > "$STATE_FILE.tmp"
  mv "$STATE_FILE.tmp" "$STATE_FILE"
  chmod 644 "$STATE_FILE"
}

fail() {
  local message="$1"
  state failed 100 "Update failed" "${TARGET_VERSION:-}" "$message"
  echo "$message" >&2
  exit 1
}

load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
  fi
  HEALTH_URL="${WFILEMANAGER_HEALTH_URL:-http://127.0.0.1:${PORT:-1973}/api/health}"
}

health_check() {
  local tries=30 response=""
  while (( tries > 0 )); do
    response="$(curl -fsS --max-time 5 "$HEALTH_URL" 2>/dev/null || true)"
    if [[ -n "$response" ]] && jq -e '.ok == true and .status == "healthy"' >/dev/null 2>&1 <<<"$response"; then
      return 0
    fi
    sleep 1
    ((tries--))
  done
  return 1
}

verify_release_archive() {
  local archive="$1" member="" type=""
  tar -tzf "$archive" >/dev/null || return 1
  while IFS= read -r member; do
    [[ -n "$member" ]] || continue
    [[ "$member" != /* ]] || { echo "Release archive contains an absolute path" >&2; return 1; }
    [[ ! "$member" =~ (^|/)\.\.(/|$) ]] || { echo "Release archive contains path traversal" >&2; return 1; }
  done < <(tar -tzf "$archive")

  while IFS= read -r type; do
    case "$type" in
      -|d) ;;
      *) echo "Release archive contains an unsupported special entry" >&2; return 1 ;;
    esac
  done < <(tar -tvzf "$archive" | awk '{print substr($1,1,1)}')
}

activate_release() {
  local release_dir="$1" previous=""
  [[ -L "$CURRENT_LINK" ]] && previous="$(readlink -f "$CURRENT_LINK")"
  if [[ -n "$previous" && "$previous" != "$release_dir" ]]; then
    printf '%s\n' "$previous" > "$PREVIOUS_FILE"
  fi
  ln -sfn "$release_dir" "$CURRENT_LINK.next"
  mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
}

install_release_commands() {
  local release_dir="$1"
  [[ -f "$release_dir/deploy/wfilemanager-reset-admin-password" ]] && \
    install -m 700 "$release_dir/deploy/wfilemanager-reset-admin-password" "$ROOT_RESET_COMMAND"
  [[ -f "$release_dir/deploy/uninstall.sh" ]] && \
    install -m 700 "$release_dir/deploy/uninstall.sh" "$UNINSTALL_COMMAND"
}

install_release() {
  STARTED_AT="$(now)"
  state checking 5 "Checking the stable release channel"
  load_env

  local tmp manifest archive expected actual release_url expected_size actual_size product current
  local extract_root project_dir release_dir old_release
  tmp="$(mktemp -d)"
  trap 'rm -rf "${tmp:-}"' EXIT
  manifest="$tmp/stable.json"
  curl -fsSL --retry 3 --connect-timeout 10 "$MANIFEST_URL" -o "$manifest" || fail "Unable to download the release manifest"

  product="$(jq -r '.product // empty' "$manifest")"
  TARGET_VERSION="$(jq -r '.version // empty' "$manifest")"
  release_url="$(jq -r '.releaseUrl // .url // empty' "$manifest")"
  expected="$(jq -r '.sha256 // empty' "$manifest" | tr '[:upper:]' '[:lower:]')"
  expected_size="$(jq -r '.size // 0' "$manifest")"

  [[ "$product" == "wfilemanager" ]] || fail "The manifest is not a wFileManager release"
  [[ "$TARGET_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || fail "The manifest contains an invalid version"
  [[ "$release_url" == https://* ]] || fail "The release URL must use HTTPS"
  [[ "$expected" =~ ^[a-f0-9]{64}$ ]] || fail "The manifest contains an invalid SHA-256 checksum"

  current=""
  [[ -L "$CURRENT_LINK" ]] && current="$(basename "$(readlink -f "$CURRENT_LINK")")"
  if [[ "${WFILEMANAGER_FORCE_UPDATE:-false}" != "true" && -n "$current" ]]; then
    if [[ "$current" == "$TARGET_VERSION" ]]; then
      state completed 100 "wFileManager $TARGET_VERSION is already installed" "$TARGET_VERSION"
      install_release_commands "$(readlink -f "$CURRENT_LINK")"
      return 0
    fi
    if dpkg --compare-versions "$TARGET_VERSION" le "$current"; then
      state completed 100 "No newer stable release is available" "$TARGET_VERSION"
      install_release_commands "$(readlink -f "$CURRENT_LINK")"
      return 0
    fi
  fi

  archive="$tmp/wfilemanager-$TARGET_VERSION.tar.gz"
  state downloading 25 "Downloading prebuilt wFileManager $TARGET_VERSION" "$TARGET_VERSION"
  curl -fL --retry 3 --connect-timeout 15 --max-time 900 "$release_url" -o "$archive" || fail "Release download failed"

  state verifying 45 "Verifying release integrity" "$TARGET_VERSION"
  actual="$(sha256sum "$archive" | awk '{print $1}')"
  actual_size="$(stat -c%s "$archive")"
  [[ "$actual" == "$expected" ]] || fail "Checksum mismatch: expected $expected, received $actual"
  [[ "$expected_size" =~ ^[0-9]+$ && "$expected_size" -gt 0 && "$actual_size" -eq "$expected_size" ]] || fail "Release size mismatch"
  verify_release_archive "$archive" || fail "Release archive validation failed"

  state extracting 65 "Extracting prebuilt application" "$TARGET_VERSION"
  extract_root="$tmp/extracted"
  mkdir -p "$extract_root"
  tar -xzf "$archive" -C "$extract_root" --no-same-owner --no-same-permissions
  project_dir="$(find "$extract_root" -maxdepth 3 -type f -path '*/.output/server/index.mjs' -printf '%h\n' | sed 's#/.output/server$##' | head -n1)"
  [[ -n "$project_dir" && -f "$project_dir/package.json" ]] || fail "The prebuilt release is incomplete"

  release_dir="$RELEASES_DIR/$TARGET_VERSION"
  rm -rf "$release_dir"
  mkdir -p "$release_dir"
  cp -a "$project_dir"/. "$release_dir"/
  [[ -f "$release_dir/.output/server/index.mjs" ]] || fail "The production server was not found"

  old_release=""
  [[ -L "$CURRENT_LINK" ]] && old_release="$(readlink -f "$CURRENT_LINK")"
  state switching 80 "Activating wFileManager $TARGET_VERSION" "$TARGET_VERSION"
  activate_release "$release_dir"
  install_release_commands "$release_dir"

  state restarting 90 "Restarting wFileManager" "$TARGET_VERSION"
  systemctl restart "$SERVICE" || true
  state health-check 95 "Running health checks" "$TARGET_VERSION"
  if ! health_check; then
    if [[ -n "$old_release" && -d "$old_release" ]]; then
      state rolling-back 97 "Health check failed; restoring the previous release" "$TARGET_VERSION"
      ln -sfn "$old_release" "$CURRENT_LINK.next"
      mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
      install_release_commands "$old_release"
      systemctl restart "$SERVICE" || true
      health_check || fail "The update and automatic rollback both failed"
    fi
    fail "The new release failed its health check and was rolled back"
  fi

  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | awk -v keep="$KEEP_RELEASES" 'NR>keep {sub(/^[^ ]+ /,""); print}' | while read -r old; do
    [[ "$(readlink -f "$CURRENT_LINK")" == "$old" ]] || rm -rf "$old"
  done
  state completed 100 "wFileManager $TARGET_VERSION installed successfully" "$TARGET_VERSION"
}

rollback_release() {
  STARTED_AT="$(now)"
  load_env
  [[ -f "$PREVIOUS_FILE" ]] || fail "No previous release is available"
  local previous current
  previous="$(cat "$PREVIOUS_FILE")"
  [[ -d "$previous" && -f "$previous/.output/server/index.mjs" ]] || fail "The previous release directory is missing"
  current=""
  [[ -L "$CURRENT_LINK" ]] && current="$(readlink -f "$CURRENT_LINK")"
  TARGET_VERSION="$(basename "$previous")"
  state rolling-back 35 "Switching to wFileManager $TARGET_VERSION" "$TARGET_VERSION"
  ln -sfn "$previous" "$CURRENT_LINK.next"
  mv -Tf "$CURRENT_LINK.next" "$CURRENT_LINK"
  install_release_commands "$previous"
  [[ -n "$current" ]] && printf '%s\n' "$current" > "$PREVIOUS_FILE"
  state restarting 75 "Restarting wFileManager" "$TARGET_VERSION"
  systemctl restart "$SERVICE" || true
  state health-check 90 "Checking the restored release" "$TARGET_VERSION"
  health_check || fail "The rolled back release failed its health check"
  state completed 100 "Rollback to wFileManager $TARGET_VERSION completed" "$TARGET_VERSION"
}

case "$ACTION" in
  install) install_release ;;
  rollback) rollback_release ;;
  *) echo "Usage: $0 {install|rollback}" >&2; exit 64 ;;
esac
