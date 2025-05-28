import { IRouter } from '../../../../src/core/server';
import { formatNodeStats } from './utils/formatNodeStats';
import { formatRecoveryStats } from './utils/formatRecoveryStats';
import { formatClusterStats } from './utils/formatClusterStats';
import { PLUGIN_ID, PLUGIN_NAME } from '../../common';

export function defineRoutes(router: IRouter, getConfig: () => any) {
  router.get(
    {
      path: '/api/' + PLUGIN_ID + '/nodes_stats',
      validate: false,
    },
    async (context, request, response) => {
      try {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'GET',
          path: '/_nodes/stats/fs,os',
        });

        const rawNodes = result.body?.nodes ?? {};
        const formattedNodes = formatNodeStats(rawNodes);

        return response.ok({
          body: formattedNodes,
        });
      } catch (err) {
        // Log the error for debugging purposes
        console.error('Error fetching node stats:', err);
        return response.customError({
          statusCode: 500,
          body: { message: 'Failed to fetch node stats' },
        });
      }
    }
  );

    router.get(
      {
        path: '/api/' + PLUGIN_ID + '/cluster_health',
        validate: false,
      },
      async (context, request, response) => {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'GET',
          path: '/_cluster/health',
        });
        return response.ok({
          body: {
            data: result.body,
          },
        });
      }
    );

  router.get(
    {
      path: '/api/' + PLUGIN_ID + '/cluster_stats',
      validate: false,
    },
    async (context, request, response) => {
      try {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'GET',
          path: '/_cluster/stats',
        });

        const formatted = formatClusterStats(result.body);

        return response.ok({
          body: formatted,
        });
      } catch (err) {
        // Log the error for debugging purposes
        console.error('Error fetching cluster stats:', err);
        return response.customError({
          statusCode: 500,
          body: { message: 'Failed to fetch cluster stats' },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/' + PLUGIN_ID + '/recovery',
      validate: false,
    },
    async (context, request, response) => {
      try {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'GET',
          path: '/_recovery?detailed',
        });

        const rawData = result.body ?? {};
        const formatted = formatRecoveryStats(rawData);

        return response.ok({
          body: formatted,
        });
      } catch (err) {
        // Log the error for debugging purposes
        console.error('Error fetching recovery data:', err);
        return response.customError({
          statusCode: 500,
          body: { message: 'Failed to fetch recovery data' },
        });
      }
    }
  );

  router.get(
    {
      path: '/api/' + PLUGIN_ID + '/config',
      validate: false,
    },
    async (context, request, response) => {
      try {
        const config = getConfig();
        return response.ok({
          body: {
            data: config ?? [],
          },
        });
      } catch (err) {
        // Log the error for debugging purposes
        console.error('Error fetching config data:', err);
        return response.customError({
          statusCode: 500,
          body: { message: 'Failed to fetch config data' },
        });
      }
    }
  );
}
