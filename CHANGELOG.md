# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project tags releases as `vMAJOR.MINOR.PATCH-osdX.Y.Z`, where the `-osd`
suffix identifies the OpenSearch Dashboards version the release targets.

## [Unreleased]

## [v1.1.1-osd3.8.0] - 2026-09-21

### Changed

- The expected node inventory (used for "missing nodes" detection in Graph View and the Nodes stat) is now derived automatically from `opensearch.hosts`, instead of requiring a separate, duplicated `monitoring.nodes` entry in `opensearch_dashboards.yml`.

### Deprecated

- `monitoring.nodes` is no longer read. A startup warning is logged if it's still set; it can be removed from your config.

### Documentation

- The "Manual Release Build" section now shows how to fix a Node.js version mismatch (via `nvm`) instead of only telling readers to check for one.

## [v1.1.0-osd3.8.0] - 2026-09-17

Compatible with OpenSearch Dashboards 3.8.0.

### Added

- JVM Heap column in the Cluster Nodes table, alongside the existing OS memory column.
- Tooltip on the "Memory (OS)" column explaining that it includes the Linux page cache/buffers and will normally read near 100% on a healthy node.
- "Missing Nodes" card in Graph View, listing nodes that are configured but not currently reporting stats.
- Automatic column layout in Graph View: the number of zone columns per row adapts to window width, wrapping additional zones onto new rows instead of growing the page wider indefinitely.

### Changed

- Graph View redesign: larger, more legible zone/role cards; a color per node role sourced from OpenSearch Dashboards' own default categorical palette; dot/label alignment computed geometrically instead of approximated.
- All status/threshold colors across the plugin (usage, recovery, cluster health, snapshot state, shard stats, node count, and the Memory (OS) bar) are now sourced from OpenSearch Dashboards' built-in palettes (`euiPaletteForStatus`, `euiPaletteColorBlind`, `euiPaletteGray`) instead of hardcoded hex values.
- OS memory is no longer color-coded as a red/amber alert, since it's expected to run high under normal operation; JVM Heap carries the alert coloring instead.
- Snapshot state now distinguishes `FAILED` (red) from `IN_PROGRESS`/other non-success states (amber).

### Fixed

- Nodes with no roles reported (coordinating-only nodes) no longer disappear from Graph View.
- Seven places where `EuiProgress`'s numeric `value` prop was being passed a stringified number instead of a number.
- A node-count stat was setting the invalid CSS value `'subdued'` directly as an inline style color; it now resolves to an actual color.
- `opensearch_dashboards.json`'s manifest version was out of sync with `package.json`.
- ESLint config was missing several browser globals and used a non-TypeScript-aware `no-unused-vars` rule, causing false positives; `yarn lint` now passes cleanly.
- Removed an orphaned screenshot no longer referenced by the README.

### Documentation

- Added a Features section and an OpenSearch Dashboards compatibility note to the README.
- Added a full "Manual Release Build" section to the README (rsync-based, mirrors the CI release workflow).

## [v1.0.2-osd3.8.0] - 2026-08-26

### Changed

- Target OpenSearch Dashboards updated to 3.8.0.
- Node.js version for tooling is now read from `.node-version` instead of being hardcoded.
- Upgraded ESLint and related dependencies.

## [v1.0.2-osd3.7.0] - 2026-08-03

### Added

- Per-node version breakdown displayed when the cluster is running mixed OpenSearch Dashboards versions.

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

Initial 1.0.0 release, targeting OpenSearch Dashboards 3.6.0.

[Unreleased]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.1.1-osd3.8.0...HEAD
[v1.1.1-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.1.0-osd3.8.0...v1.1.1-osd3.8.0
[v1.1.0-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.2-osd3.8.0...v1.1.0-osd3.8.0
[v1.0.2-osd3.8.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.2-osd3.7.0...v1.0.2-osd3.8.0
[v1.0.2-osd3.7.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.1-osd3.7.0...v1.0.2-osd3.7.0
[v1.0.1-osd3.7.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.1-osd3.6.0...v1.0.1-osd3.7.0
[v1.0.1-osd3.6.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/compare/v1.0.0-osd3.6.0...v1.0.1-osd3.6.0
[v1.0.0-osd3.6.0]: https://github.com/Psych0meter/opensearch-dashboards-plugin-monitoring/releases/tag/v1.0.0-osd3.6.0
