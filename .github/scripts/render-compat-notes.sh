#!/usr/bin/env bash
# Reads a release body on stdin and prints it with an up-to-date block listing
# the OpenSearch Dashboards versions that have a zip. Any previous block
# (between the markers) is replaced; the rest of the body is kept as is.
#
# Environment:
#   PLUGIN_ID, PLUGIN_VERSION   as in compat-plan.sh
#   ASSETS                      newline separated asset names on the release
set -euo pipefail

: "${PLUGIN_ID:?}" "${PLUGIN_VERSION:?}"
ASSETS="${ASSETS:-}"
START='<!-- osd-compat:start -->'
END='<!-- osd-compat:end -->'

body=$(cat)
# drop a previous block, if any
body=$(printf '%s\n' "$body" | awk -v s="$START" -v e="$END" '
  $0 == s { skip = 1; next }
  $0 == e { skip = 0; next }
  !skip { print }')
# trim trailing blank lines
body=$(printf '%s' "$body" | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')

versions=$(printf '%s\n' "$ASSETS" \
  | sed -nE "s/^${PLUGIN_ID}-${PLUGIN_VERSION//./\\.}-osd([0-9]+\.[0-9]+\.[0-9]+)\.zip$/\1/p; s/^${PLUGIN_ID}-([0-9]+\.[0-9]+\.[0-9]+)\.zip$/\1/p" \
  | sort -uV)

{
  [ -n "$body" ] && printf '%s\n\n' "$body"
  echo "$START"
  echo "### Compatible OpenSearch Dashboards versions"
  echo
  echo "Download the zip matching your OpenSearch Dashboards version."
  echo
  if [ -n "$versions" ]; then
    while read -r v; do echo "- $v"; done <<< "$versions"
  else
    echo "_No build attached yet._"
  fi
  echo "$END"
}
