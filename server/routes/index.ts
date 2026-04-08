import { IRouter } from '../../../../src/core/server';
import { formatNodeStats } from './utils/formatNodeStats';
import { formatRecoveryStats } from './utils/formatRecoveryStats';
import { formatClusterStats } from './utils/formatClusterStats';
import { PLUGIN_ID } from '../../common';

/**
 * Utility to simplify route creation.
 *
 * @param router - OpenSearch Dashboards router instance.
 * @param path - API endpoint path.
 * @param handler - Function that fetches and transforms the data.
 */
function createRoute(
  router: IRouter,
  path: string,
  handler: (context: any) => Promise<any>
) {
  router.get(
    { path: `/api/${PLUGIN_ID}${path}`, validate: false },
    async (context, request, response) => {
      try {
        const body = await handler(context);
        return response.ok({ body });
      } catch (err) {
        return response.customError({
          statusCode: 500,
          body: { message: err },
        });
      }
    }
  );
}

/**
 * Helper to clean URL strings: 
 * "https://HOST:9200" -> "HOST"
 */
const cleanHost = (host: string) => {
  return host
    .replace(/^https?:\/\//, '') // Remove http:// or https://
    .replace(/:\d+$/, '')        // Remove :port
    .replace(/\/$/, '');         // Remove trailing slash if present
};

/**
 * Registers API routes for the plugin.
 *
 * @param router - OpenSearch Dashboards router instance.
 * @param getConfig - Function to retrieve global configuration.
 */
export function defineRoutes(router: IRouter, getConfig: () => any) {
  // Nodes stats
  createRoute(router, '/nodes_stats', async (context) => {
    const result = await context.core.opensearch.client.asCurrentUser.transport.request({
      method: 'GET',
      path: '/_nodes/stats/fs,os',
    });
    return formatNodeStats(result.body?.nodes ?? {});
  });

  // Cluster health
  createRoute(router, '/cluster_health', async (context) => {
    const result = await context.core.opensearch.client.asCurrentUser.transport.request({
      method: 'GET',
      path: '/_cluster/health',
    });
    return { data: result.body };
  });

  // Cluster stats
  createRoute(router, '/cluster_stats', async (context) => {
    const result = await context.core.opensearch.client.asCurrentUser.transport.request({
      method: 'GET',
      path: '/_cluster/stats',
    });
    return formatClusterStats(result.body);
  });

  // Recovery
  createRoute(router, '/recovery', async (context) => {
    const result = await context.core.opensearch.client.asCurrentUser.transport.request({
      method: 'GET',
      path: '/_recovery?detailed',
    });
    return formatRecoveryStats(result.body ?? {});
  });

  // Plugin config - MODIFIED
  createRoute(router, '/config', async () => {
    const globalConfig = getConfig() || {};
    
    // Extract opensearch.hosts (also checking elasticsearch.hosts just in case)
    const rawHosts = globalConfig.opensearch?.hosts || globalConfig.elasticsearch?.hosts || [];
    
    // Ensure it's an array (sometimes users put a single string in the yml)
    const hostsArray = Array.isArray(rawHosts) ? rawHosts : [rawHosts];

    // Clean the hosts strings
    const cleanedNodes = hostsArray.map((h: string) => cleanHost(h));

    // Structure matches your frontend expected payload (config.data.nodes)
    return { data: { nodes: cleanedNodes } };
  });

  // Snapshots
  createRoute(router, '/snapshots', async (context) => {
    const result = await context.core.opensearch.client.asCurrentUser.transport.request({
      method: 'GET',
      path: '/_snapshot/_status',
    });
    return result.body ?? {};
  });
}
