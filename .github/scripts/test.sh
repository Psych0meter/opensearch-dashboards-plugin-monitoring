#!/usr/bin/env bash
# Offline tests for the release helper scripts: `.github/scripts/test.sh`
set -euo pipefail
cd "$(dirname "$0")/../.."

fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "ok   - $1"; else echo "FAIL - $1"; echo "  expected: $2"; echo "  actual:   $3"; fail=1; fi
}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# --- supported-osd-versions.sh ---------------------------------------------
cat > "$tmp/tags" <<'TAGS'
2.19.7
3.0.0
3.0.0-alpha1
3.0.0-beta1
3.7.0
3.8.0
3.8.1
3.9.0
3.10.0
3.10.0-rc1
3.9
4.0.0
v3.9.0
TAGS
echo '{"minimum":"3.8.0","major":3}' > "$tmp/cfg.json"
actual=$(SUPPORTED_CONFIG="$tmp/cfg.json" OSD_TAGS_FILE="$tmp/tags" .github/scripts/supported-osd-versions.sh)
check "versions: >= minimum, same major, stable only, version-sorted" '["3.8.0","3.8.1","3.9.0","3.10.0"]' "$actual"

echo '{"minimum":"3.9.0","major":3}' > "$tmp/cfg.json"
actual=$(SUPPORTED_CONFIG="$tmp/cfg.json" OSD_TAGS_FILE="$tmp/tags" .github/scripts/supported-osd-versions.sh)
check "versions: raising the minimum drops older ones" '["3.9.0","3.10.0"]' "$actual"

echo '{"minimum":"9.0.0","major":9}' > "$tmp/cfg.json"
if SUPPORTED_CONFIG="$tmp/cfg.json" OSD_TAGS_FILE="$tmp/tags" .github/scripts/supported-osd-versions.sh 2>/dev/null; then
  check "versions: fails when nothing matches" "failure" "success"
else
  check "versions: fails when nothing matches" "failure" "failure"
fi

# --- compat-plan.sh ----------------------------------------------------------
export PLUGIN_ID=monitoringPlugin PLUGIN_VERSION=1.2.0
export SUPPORTED='["3.8.0","3.9.0","3.10.0"]'

ASSETS=$'monitoringPlugin-3.9.0.zip' \
  check "plan: legacy asset name counts as present" '["3.8.0","3.10.0"]' "$(ASSETS=$'monitoringPlugin-3.9.0.zip' .github/scripts/compat-plan.sh)"
check "plan: current asset names count as present" '["3.10.0"]' \
  "$(ASSETS=$'monitoringPlugin-1.2.0-osd3.8.0.zip\nmonitoringPlugin-1.2.0-osd3.9.0.zip' .github/scripts/compat-plan.sh)"
check "plan: everything present -> nothing to build" '[]' \
  "$(ASSETS=$'monitoringPlugin-1.2.0-osd3.8.0.zip\nmonitoringPlugin-1.2.0-osd3.9.0.zip\nmonitoringPlugin-1.2.0-osd3.10.0.zip' .github/scripts/compat-plan.sh)"
check "plan: another plugin version's zips do not count" '["3.8.0","3.9.0","3.10.0"]' \
  "$(ASSETS=$'monitoringPlugin-1.1.0-osd3.8.0.zip\nmonitoringPlugin-1.1.0-osd3.9.0.zip' .github/scripts/compat-plan.sh)"
check "plan: no assets -> everything" '["3.8.0","3.9.0","3.10.0"]' "$(ASSETS='' .github/scripts/compat-plan.sh)"
check "plan: FORCE_VERSION rebuilds a present version" '["3.9.0","3.10.0"]' \
  "$(FORCE_VERSION=3.9.0 ASSETS=$'monitoringPlugin-1.2.0-osd3.9.0.zip\nmonitoringPlugin-1.2.0-osd3.8.0.zip' .github/scripts/compat-plan.sh)"

# --- render-compat-notes.sh --------------------------------------------------
assets=$'monitoringPlugin-1.2.0-osd3.10.0.zip\nmonitoringPlugin-1.2.0-osd3.8.0.zip\nmonitoringPlugin-3.9.0.zip\nunrelated.txt'
out=$(printf '### Added\n\n- thing\n' | ASSETS="$assets" .github/scripts/render-compat-notes.sh)
check "notes: keeps the body, appends a sorted version list" \
  $'### Added\n\n- thing\n\n<!-- osd-compat:start -->\n### Compatible OpenSearch Dashboards versions\n\nDownload the zip matching your OpenSearch Dashboards version.\n\n- 3.8.0\n- 3.9.0\n- 3.10.0\n<!-- osd-compat:end -->' "$out"
again=$(printf '%s\n' "$out" | ASSETS="$assets"$'\nmonitoringPlugin-1.2.0-osd3.11.0.zip' .github/scripts/render-compat-notes.sh)
check "notes: replaces the previous block instead of duplicating it" "1" "$(printf '%s\n' "$again" | grep -c 'osd-compat:start')"
check "notes: updated list includes the new version" "1" "$(printf '%s\n' "$again" | grep -c -- '- 3.11.0')"
idem=$(printf '%s\n' "$out" | ASSETS="$assets" .github/scripts/render-compat-notes.sh)
check "notes: idempotent" "$out" "$idem"
check "notes: empty body and no assets" $'<!-- osd-compat:start -->\n### Compatible OpenSearch Dashboards versions\n\nDownload the zip matching your OpenSearch Dashboards version.\n\n_No build attached yet._\n<!-- osd-compat:end -->' \
  "$(printf '' | ASSETS='' .github/scripts/render-compat-notes.sh)"

exit $fail
