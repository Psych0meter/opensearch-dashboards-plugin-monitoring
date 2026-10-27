#!/usr/bin/env bash
# Prints, as a JSON array, the supported OpenSearch Dashboards versions that
# have no zip on a release yet.
#
# A version counts as present when the release has either
#   <id>-<plugin version>-osd<version>.zip   (current naming), or
#   <id>-<version>.zip                       (naming used up to v1.2.0)
#
# Environment:
#   PLUGIN_ID       plugin id, e.g. monitoringPlugin
#   PLUGIN_VERSION  plugin version of the release, e.g. 1.2.0
#   SUPPORTED       JSON array of supported versions
#   ASSETS          newline separated asset names currently on the release
#   FORCE_VERSION   optional: rebuild this version even if it is present
set -euo pipefail

: "${PLUGIN_ID:?}" "${PLUGIN_VERSION:?}" "${SUPPORTED:?}"
ASSETS="${ASSETS:-}"
FORCE_VERSION="${FORCE_VERSION:-}"

jq -nc \
  --arg id "$PLUGIN_ID" \
  --arg pv "$PLUGIN_VERSION" \
  --arg force "$FORCE_VERSION" \
  --argjson supported "$SUPPORTED" \
  --arg assets "$ASSETS" '
  ($assets | split("\n") | map(select(length > 0))) as $present
  | $supported
  | map(select(
      . as $v
      | $v == $force
        or (($present | index("\($id)-\($pv)-osd\($v).zip")) == null
            and ($present | index("\($id)-\($v).zip")) == null)
    ))'
