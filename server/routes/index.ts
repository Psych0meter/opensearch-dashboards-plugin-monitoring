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
import { PLUGIN_ID } from '../../common';

interface RouteSpec {
  /** Path below `/api/<plugin id>`. */
  path: string;
  /** Human-readable resource name, used in error messages and logs. */
  resource: string;
  /** OpenSearch privilege(s) the route needs, surfaced on 403. */
  privilege: string;
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

  router.get({ path: fullPath, validate: false }, async (context, request, response) => {
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
        }),
        client.transport.request({
          method: 'GET',
          path: '/_nodes?filter_path=nodes.*.name,nodes.*.version',
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
  createRoute(router, logger, {
    path: '/recovery',
    resource: 'shard recoveries',
    privilege: 'indices:monitor/recovery',
    handler: async (context) => {
      const result = await context.core.opensearch.client.asCurrentUser.transport.request({
        method: 'GET',
        path: '/_recovery?detailed',
      });
      return formatRecoveryStats(result.body);
    },
  });

  // Plugin config - the expected node inventory, derived from the live
  // OpenSearch client's connection pool (built from opensearch.hosts).
  createRoute(router, logger, {
    path: '/config',
    resource: 'the configured node inventory',
    privilege: 'none',
    handler: async (context) => {
      const transport = context.core.opensearch.client.asCurrentUser?.transport as
        | { connectionPool?: { connections?: { url?: URL }[] } }
        | undefined;
      const connections = transport?.connectionPool?.connections ?? [];
      const nodes = Array.from(
        new Set(
          connections
            .map((connection) => connection.url?.hostname)
            .filter((hostname): hostname is string => Boolean(hostname))
        )
      );
      return { data: { nodes } };
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
