#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:-$(jq -r '.version' package.json)}"
TAG="v$VERSION"
SUPABASE_URL="${SUPABASE_URL:-https://igihzeyfgwhnuiflamvn.supabase.co}"
BUCKET="${WFILEMANAGER_RELEASE_BUCKET:-releases.kmerhosting.com}"
PREFIX="${WFILEMANAGER_RELEASE_PREFIX:-wfilemanager}"
PUBLIC_BASE="$SUPABASE_URL/storage/v1/object/public/$BUCKET/$PREFIX"
ASSET_DIR="${WFILEMANAGER_RELEASE_ASSET_DIR:-release-assets}"
REPOSITORY="${GITHUB_REPOSITORY:-KmerHosting/wfilemanager}"

command -v gh >/dev/null || { echo "gh is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }
[[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]] || {
  echo "SUPABASE_SERVICE_ROLE_KEY is required to publish the stable channel." >&2
  exit 1
}

rm -rf "$ASSET_DIR"
mkdir -p "$ASSET_DIR"

gh release download "$TAG" \
  --repo "$REPOSITORY" \
  --pattern "wfilemanager-$VERSION.tar.gz" \
  --pattern "SHA256SUMS" \
  --dir "$ASSET_DIR"

(
  cd "$ASSET_DIR"
  sha256sum -c SHA256SUMS
)

ARCHIVE="$ASSET_DIR/wfilemanager-$VERSION.tar.gz"
SHA256="$(sha256sum "$ARCHIVE" | awk '{print $1}')"
SIZE="$(stat -c%s "$ARCHIVE")"

EXTRACT_DIR="$(mktemp -d)"
trap 'rm -rf "$EXTRACT_DIR"' EXIT

tar -xzf "$ARCHIVE" -C "$EXTRACT_DIR"
PROJECT_ROOT="$(find "$EXTRACT_DIR" -mindepth 1 -maxdepth 2 -type f -name package.json -printf '%h\n' | head -n1)"
[[ -n "$PROJECT_ROOT" ]] || { echo "Unable to locate package.json in the prebuilt runtime archive." >&2; exit 1; }

for file in install.sh update.sh uninstall.sh wfilemanager.service 'wfilemanager-updater@.service'; do
  cp "$PROJECT_ROOT/deploy/$file" "$ASSET_DIR/$file"
done

PUBLISHED_AT="$(gh release view "$TAG" --repo "$REPOSITORY" --json publishedAt --jq '.publishedAt')"
SOURCE_COMMIT="$(gh api "repos/$REPOSITORY/releases/tags/$TAG" --jq '.target_commitish')"

sha() { sha256sum "$ASSET_DIR/$1" | awk '{print $1}'; }

jq -n \
  --arg product "wfilemanager" \
  --arg version "$VERSION" \
  --arg channel "stable" \
  --arg releaseUrl "$PUBLIC_BASE/wfilemanager-$VERSION.tar.gz" \
  --arg sha256 "$SHA256" \
  --argjson size "$SIZE" \
  --arg publishedAt "$PUBLISHED_AT" \
  --arg sourceCommit "$SOURCE_COMMIT" \
  --arg githubUrl "https://github.com/KmerHosting/wfilemanager" \
  --arg installUrl "$PUBLIC_BASE/install.sh" \
  --arg canonicalBaseUrl "https://releases.kmerhosting.com/wfilemanager" \
  --arg installer "$PUBLIC_BASE/install.sh" \
  --arg updater "$PUBLIC_BASE/update.sh" \
  --arg uninstaller "$PUBLIC_BASE/uninstall.sh" \
  --arg appService "$PUBLIC_BASE/wfilemanager.service" \
  --arg updaterService "$PUBLIC_BASE/wfilemanager-updater@.service" \
  --arg installerSha256 "$(sha install.sh)" \
  --arg updaterSha256 "$(sha update.sh)" \
  --arg uninstallerSha256 "$(sha uninstall.sh)" \
  --arg appServiceSha256 "$(sha wfilemanager.service)" \
  --arg updaterServiceSha256 "$(sha 'wfilemanager-updater@.service')" \
  '{
    schema: 1,
    product: $product,
    version: $version,
    channel: $channel,
    url: $releaseUrl,
    releaseUrl: $releaseUrl,
    sha256: $sha256,
    size: $size,
    publishedAt: $publishedAt,
    sourceCommit: $sourceCommit,
    minimumVersion: "0.6.0",
    githubUrl: $githubUrl,
    installUrl: $installUrl,
    canonicalBaseUrl: $canonicalBaseUrl,
    notes: [
      "Single local administrator with SQLite-only application state.",
      "Prebuilt verified stable release with automatic rollback after a failed health check."
    ],
    assets: {
      installer: $installer,
      updater: $updater,
      uninstaller: $uninstaller,
      appService: $appService,
      updaterService: $updaterService,
      installerSha256: $installerSha256,
      updaterSha256: $updaterSha256,
      uninstallerSha256: $uninstallerSha256,
      appServiceSha256: $appServiceSha256,
      updaterServiceSha256: $updaterServiceSha256
    }
  }' > "$ASSET_DIR/stable.json"

bash deploy/publish-release.sh "$ASSET_DIR"

echo "Stable channel now points to wFileManager $VERSION."
