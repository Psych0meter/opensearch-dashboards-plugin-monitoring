# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
for the plugin version. Releases are tagged `vMAJOR.MINOR.PATCH-osdX.Y.Z`, where
the `-osd` suffix is the exact OpenSearch Dashboards version the build targets.

## [Unreleased]

### Added

- Node Uptime stat showing the shortest and longest JVM uptime across nodes, with a tooltip naming both nodes, and an Uptime column in the Cluster Nodes table.
- Warning icon next to "Last update" listing the data sources that failed on the latest refresh.
- Screen-reader description of the Graph View topology (zones, roles, nodes, missing nodes).
- Unit test suite (`yarn test`) for the formatters, error mapping, node inventory matching and auto-refresh scheduling.
- Pull requests are built, linted and tested by the release workflow.

### Changed

- Missing-node detection still uses `opensearch.hosts`, but now matches each configured host against node names, host names, IP addresses and publish addresses, including short host names and the addresses the host resolves to. When no configured host matches any node (a load balancer or proxy), alarms are disabled and an info tooltip explains why.
- The Active nodes count compares against the number of nodes the configured hosts account for.
- Shard Recovery requests ongoing recoveries only; completed recoveries are fetched only while "Hide completed items" is off.
- Node statistics requests only return the fields the plugin displays.
- Graph View cards, borders and text follow the light or dark Dashboards theme.
- Auto-refresh pauses while the browser tab is hidden and refreshes as soon as it is visible again.
- Toasts for a failing data source are shown once, not on every auto-refresh.
- "Last update" only advances when every data source refreshed successfully.
- API errors keep a meaningful HTTP status (401, 403, 404, 429, 502, 503, 504); a 403 names the OpenSearch privilege the request needs.
- The release workflow publishes only for a `vX.Y.Z-osdA.B.C` tag or an explicit `release_tag` input, requires the tag to match the manifest and `package.json` versions and a CHANGELOG section, and checks the packaged manifest. Other runs upload the build as a workflow artifact.

### Removed

- The cluster "Uptime" stat, which showed the uptime of the longest-running node rather than the cluster (replaced by Node Uptime).

### Fixed

- Clearing the auto-refresh interval could persist an invalid value that restarted polling with no delay on the next page load, flooding Dashboards and the cluster with requests.
- Slow refreshes could overlap with the next auto-refresh round.
- Missing-node detection compared configured host names with node names, reporting false missing and unexpected nodes when they differ (FQDN vs short name, IP addresses, load balancer).
- The Cluster Nodes and Shard Recovery tables could stop showing their loading state while their own request was still running.
- A node omitting part of its statistics (e.g. while starting) made the whole Nodes and Cluster sections fail.
- Durations shorter than one minute were displayed as an empty value.

### Security

- Error responses no longer include raw OpenSearch error messages, which could expose internal addresses or request details; full errors are logged server-side instead.
- The release workflow no longer interpolates workflow inputs and refs into shell commands, and validates them before use.

## [v1.1.1-osd3.9.0] - 2026-09-30

### Changed

- Target OpenSearch Dashboards updated to 3.9.0.

## [v1.1.1-osd3.8.0] - 2026-09-21

### Changed

- The expected node inventory (used for "missing nodes" detection in Graph View and the Nodes stat) is now derived automatically from `opensearch.hosts`, instead of requiring a separate, duplicated `monitoring.nodes` entry in `opensearch_dashboards.yml`.
- The "Manual Release Build" README section shows how to fix a Node.js version mismatch with `nvm`.

### Deprecated

- `monitoring.nodes` is no longer read. A startup warning is logged if it's still set; it can be removed from your config.

## [v1.1.0-osd3.8.0] - 2026-09-17

### Added

- JVM Heap column in the Cluster Nodes table, alongside the existing OS memory column.
- Tooltip on the "Memory (OS)" column explaining that it includes the Linux page cache/buffers and will normally read near 100% on a healthy node.
- "Missing Nodes" card in Graph View, listing nodes that are configured but not currently reporting stats.
- Automatic column layout in Graph View: the number of zone columns per row adapts to window width, wrapping additional zones onto new rows instead of growing the page wider indefinitely.
- Features section and OpenSearch Dashboards compatibility note in the README.
- "Manual Release Build" section in the README (rsync-based, mirrors the CI release workflow).

### Changed

- Graph View redesign: larger, more legible zone/role cards; a color per node role sourced from OpenSearch Dashboards' own default categorical palette; dot/label alignment computed geometrically instead of approximated.
- All status/threshold colors across the plugin (usage, recovery, cluster health, snapshot state, shard stats, node count, and the Memory (OS) bar) are now sourced from OpenSearch Dashboards' built-in palettes (`euiPaletteForStatus`, `euiPaletteColorBlind`, `euiPaletteGray`) instead of hardcoded hex values.
- OS memory is no longer color-coded as a red/amber alert, since it's expected to run high under normal operation; JVM Heap carries the alert coloring instead.
- Snapshot state now distinguishes `FAILED` (red) from `IN_PROGRESS`/other non-success states (amber).

### Removed

- An orphaned screenshot no longer referenced by the README.

### Fixed

- Nodes with no roles reported (coordinating-only nodes) no longer disappear from Graph View.
- Seven places where `EuiProgress`'s numeric `value` prop was being passed a stringified number instead of a number.
- A node-count stat was setting the invalid CSS value `'subdued'` directly as an inline style color; it now resolves to an actual color.
- `opensearch_dashboards.json`'s manifest version was out of sync with `package.json`.
- ESLint config was missing several browser globals and used a non-TypeScript-aware `no-unused-vars` rule, causing false positives; `yarn lint` now passes cleanly.

## [v1.0.2-osd3.8.0] - 2026-08-26

### Changed

- Target OpenSearch Dashboards updated to 3.8.0.
- Node.js version for tooling is now read from `.node-version` instead of being hardcoded.
- Upgraded ESLint and related dependencies.

## [v1.0.2-osd3.7.0] - 2026-08-03

### Added

- Per-node version breakdown displayed when the cluster is running mixed OpenSearch versions.

### Fixed

- Corrected several i18n message ids and improved error handling.

### Removed

- Unused dependencies.

## [v1.0.1-osd3.7.0] - 2026-06-10

### Changed

- Target OpenSearch Dashboards updated to 3.7.0.
- Build tooling updated to Node.js 24.

## [v1.0.1-osd3.6.0] - 2026-04-08

### Changed

- Percentage-calculation helper moved into the shared `common` module.

## [v1.0.0-osd3.6.0] - 2026-04-08

### Added

- Initial 1.0.0 release, targeting OpenSearch Dashboards 3.6.0.

[Unreleased]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.1.1-osd3.9.0...HEAD
[v1.1.1-osd3.9.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.1.1-osd3.8.0...v1.1.1-osd3.9.0
[v1.1.1-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.1.0-osd3.8.0...v1.1.1-osd3.8.0
[v1.1.0-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.2-osd3.8.0...v1.1.0-osd3.8.0
[v1.0.2-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.2-osd3.7.0...v1.0.2-osd3.8.0
[v1.0.2-osd3.7.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.1-osd3.7.0...v1.0.2-osd3.7.0
[v1.0.1-osd3.7.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.1-osd3.6.0...v1.0.1-osd3.7.0
[v1.0.1-osd3.6.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.0-osd3.6.0...v1.0.1-osd3.6.0
[v1.0.0-osd3.6.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/releases/tag/v1.0.0-osd3.6.0
