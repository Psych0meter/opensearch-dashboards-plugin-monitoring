#!/usr/bin/env bash
# Prints, as a JSON array in ascending order, the stable OpenSearch Dashboards
# versions the plugin is built for: every X.Y.Z release of the configured
# major version that is >= the configured minimum (.github/supported-osd.json).
# Pre-releases such as 3.0.0-alpha1 are ignored.
#
# Environment:
#   SUPPORTED_CONFIG  config file (default: .github/supported-osd.json)
#   OSD_TAGS_FILE     file with one tag per line, instead of querying GitHub
#                     (used by the tests)
set -euo pipefail

CONFIG="${SUPPORTED_CONFIG:-.github/supported-osd.json}"
MINIMUM=$(jq -er '.minimum' "$CONFIG")
MAJOR=$(jq -er '.major' "$CONFIG")

SEMVER_RE='^[0-9]+\.[0-9]+\.[0-9]+$'
[[ "$MINIMUM" =~ $SEMVER_RE ]] || { echo "invalid minimum '$MINIMUM' in $CONFIG" >&2; exit 1; }
[[ "$MAJOR" =~ ^[0-9]+$ ]] || { echo "invalid major '$MAJOR' in $CONFIG" >&2; exit 1; }

if [ -n "${OSD_TAGS_FILE:-}" ]; then
  tags=$(cat "$OSD_TAGS_FILE")
else
  tags=$(git ls-remote --tags --refs https://github.com/opensearch-project/OpenSearch-Dashboards.git \
    | awk '{ sub("refs/tags/", "", $2); print $2 }')
fi

versions=$(printf '%s\n' "$tags" \
  | grep -E "$SEMVER_RE" \
  | awk -F. -v major="$MAJOR" '$1 == major' \
  | sort -V \
  | while read -r version; do
      # keep versions >= minimum
      if [ "$(printf '%s\n%s\n' "$MINIMUM" "$version" | sort -V | head -n1)" = "$MINIMUM" ]; then
        echo "$version"
      fi
    done)

if [ -z "$versions" ]; then
  echo "no OpenSearch Dashboards version matches $CONFIG" >&2
  exit 1
fi

printf '%s\n' "$versions" | jq -R . | jq -sc .
