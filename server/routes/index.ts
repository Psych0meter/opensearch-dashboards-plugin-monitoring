import { IRouter } from '../../../../src/core/server';
import { formatNodeStats } from './utils/formatNodeStats';
import { formatRecoveryStats } from './utils/formatRecoveryStats';
import { formatClusterStats } from './utils/formatClusterStats';
import { PLUGIN_ID } from '../../common';

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
        return response.customError({
          statusCode: 500,
          body: { message: err },
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
      try {
        const result = await context.core.opensearch.client.asCurrentUser.transport.request({
          method: 'GET',
          path: '/_cluster/health',
        });
        return response.ok({
          body: {
            data: result.body,
          },
        });
      } catch (err) {
        return response.customError({
          statusCode: 500,
          body: { message: err },
        });
      }
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
        return response.customError({
          statusCode: 500,
          body: { message: err },
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
        return response.customError({
          statusCode: 500,
          body: { message: err },
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
        return response.customError({
          statusCode: 500,
          body: { message: err },
        });
      }
    }
  );
}
