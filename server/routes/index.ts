import {
  IRouter,
  Logger,
  RequestHandlerContext,
  OpenSearchDashboardsRequest,
} from '../../../../src/core/server';
import { formatNodeStats } from './utils/formatNodeStats';
import { formatRecoveryStats } from './utils/formatRecoveryStats';
import { formatClusterStats } from './utils/formatClusterStats';
import { sanitizeError } from './errors';
import { HostResolver, getConfiguredHosts } from './inventory';
import { PLUGIN_ID } from '../../common';
import { schema, Type } from '@osd/config-schema';

/**
 * Fields of /_nodes/stats actually used by formatNodeStats. Requesting only
 * these keeps the per-refresh payload small on large clusters (the full
 * fs/os/jvm stats include per-device, per-pool and GC details per node).
 */
const NODE_STATS_FILTER = [
  'name',
  'host',
  'ip',
  'transport_address',
  'roles',
  'attributes.zone',
  'os.cpu.percent',
  'os.mem.total_in_bytes',
  'os.mem.used_in_bytes',
  'os.swap.total_in_bytes',
  'os.swap.used_in_bytes',
  'fs.total.total_in_bytes',
  'fs.total.free_in_bytes',
  'jvm.uptime_in_millis',
  'jvm.mem.heap_used_in_bytes',
  'jvm.mem.heap_max_in_bytes',
]
  .map((field) => `nodes.*.${field}`)
  .join(',');

/**
 * Fields of the Nodes Info API (http metric only) merged into node stats.
 */
const NODE_INFO_FILTER = ['name', 'version', 'host', 'ip', 'transport_address', 'http.publish_address']
  .map((field) => `nodes.*.${field}`)
  .join(',');

interface RouteSpec {
  /** Path below `/api/<plugin id>`. */
  path: string;
  /** Human-readable resource name, used in error messages and logs. */
  resource: string;
  /** OpenSearch privilege(s) the route needs, surfaced on 403. */
  privilege: string;
  /** Optional query-string schema; requests not matching it get a 400. */
  query?: Type<Record<string, unknown>>;
  handler: (
    context: RequestHandlerContext,
    request: OpenSearchDashboardsRequest
  ) => Promise<unknown>;
}

/**
 * Registers a GET route whose failures are logged in full server-side and
 * returned to the browser as a sanitized message with a meaningful status
 * code (e.g. 403 for missing privileges instead of a blanket 500).
 *
 * All OpenSearch calls are made `asCurrentUser`, so the user's own
 * privileges are enforced by the cluster.
 */
function createRoute(router: IRouter, logger: Logger, spec: RouteSpec) {
  const fullPath = `/api/${PLUGIN_ID}${spec.path}`;

  const validate = spec.query ? { query: spec.query } : false;

  router.get({ path: fullPath, validate }, async (context, request, response) => {
    try {
      const body = await spec.handler(context, request);
      return response.ok({ body: body as Record<string, unknown> });
    } catch (err: unknown) {
      const { statusCode, message } = sanitizeError(err, spec.resource, spec.privilege);
      const detail = err instanceof Error ? err.stack ?? err.message : String(err);
      if (statusCode >= 500) {
        logger.error(`GET ${fullPath} failed (${statusCode}): ${detail}`);
      } else {
        logger.warn(`GET ${fullPath} rejected (${statusCode}): ${err instanceof Error ? err.message : String(err)}`);
      }
      return response.customError({ statusCode, body: { message } });
    }
  });
}

/**
 * Registers API routes for the plugin.
 *
 * @param router - OpenSearch Dashboards router instance.
 * @param logger - Plugin logger, used to record full error details.
 */
export function defineRoutes(router: IRouter, logger: Logger) {
  // Nodes stats
  createRoute(router, logger, {
    path: '/nodes_stats',
    resource: 'node statistics',
    privilege: 'cluster:monitor/nodes/stats, cluster:monitor/nodes/info',
    handler: async (context) => {
      const client = context.core.opensearch.client.asCurrentUser;
      // Node version is not exposed by /_nodes/stats, so it's fetched
      // separately from the (lightweight, filtered) Nodes Info API and
      // merged in below. This lets the UI list which nodes are on which
      // version when a cluster has mixed versions (e.g. mid-upgrade).
      const [statsResult, infoResult] = await Promise.all([
        client.transport.request({
          method: 'GET',
          path: '/_nodes/stats/fs,os,jvm',
          querystring: { filter_path: NODE_STATS_FILTER },
        }),
        client.transport.request({
          method: 'GET',
          path: '/_nodes/http',
          querystring: { filter_path: NODE_INFO_FILTER },
        }),
      ]);
      return formatNodeStats(statsResult.body?.nodes, infoResult.body?.nodes);
    },
  });

  // Cluster health
  createRoute(router, logger, {
    path: '/cluster_health',
    resource: 'cluster health',
    privilege: 'cluster:monitor/health',
    handler: async (context) => {
      const result = await context.core.opensearch.client.asCurrentUser.transport.request({
        method: 'GET',
        path: '/_cluster/health',
      });
      return { data: result.body };
    },
  });

  // Cluster stats
  createRoute(router, logger, {
    path: '/cluster_stats',
    resource: 'cluster statistics',
    privilege: 'cluster:monitor/stats',
    handler: async (context) => {
      const result = await context.core.opensearch.client.asCurrentUser.transport.request({
        method: 'GET',
        path: '/_cluster/stats',
      });
      return formatClusterStats(result.body);
    },
  });

  // Recovery
  //
  // By default only ongoing recoveries are requested (`active_only`), so the
  // cluster doesn't serialize every completed recovery on each refresh. The
  // UI asks for completed ones explicitly with `include_completed=true`.
  //
  // `detailed` is not requested: it only adds the per-file breakdown, which
  // the UI never displays; the aggregate file/byte/translog progress used by
  // formatRecoveryStats is part of the default response.
  //
  // Note that completed entries are not a history: OpenSearch only reports
  // the latest recovery of each shard copy that still exists.
  createRoute(router, logger, {
    path: '/recovery',
    resource: 'shard recoveries',
    privilege: 'indices:monitor/recovery',
    query: schema.object({
      include_completed: schema.boolean({ defaultValue: false }),
    }),
    handler: async (context, request) => {
      const { include_completed: includeCompleted } = request.query as {
        include_completed: boolean;
      };
      const result = await context.core.opensearch.client.asCurrentUser.transport.request({
        method: 'GET',
        path: '/_recovery',
        querystring: includeCompleted ? {} : { active_only: true },
      });
      return formatRecoveryStats(result.body);
    },
  });

  // Plugin config - the expected node inventory, derived from the live
  // OpenSearch client's connection pool (built from opensearch.hosts), with
  // each host resolved to its addresses so the browser can match it against
  // node names, host names and publish addresses (see
  // common/node_inventory.ts).
  const resolver = new HostResolver();
  createRoute(router, logger, {
    path: '/config',
    resource: 'the configured node inventory',
    privilege: 'none',
    handler: async (context) => {
      const hosts = getConfiguredHosts(context.core.opensearch.client.asCurrentUser?.transport);
      return { data: { hosts: await resolver.resolveAll(hosts) } };
    },
  });

  // Snapshots
  createRoute(router, logger, {
    path: '/snapshots',
    resource: 'running snapshots',
    privilege: 'cluster:admin/snapshot/status',
    handler: async (context) => {
      const result = await context.core.opensearch.client.asCurrentUser.transport.request({
        method: 'GET',
        path: '/_snapshot/_status',
      });
      return result.body ?? {};
    },
  });
}
