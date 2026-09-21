import {
  PluginInitializerContext,
  CoreSetup,
  CoreStart,
  Plugin,
  Logger,
} from '../../../src/core/server';

import { MonitoringPluginSetup, MonitoringPluginStart } from './types';
import { defineRoutes } from './routes';
import { Observable } from 'rxjs';

export class MonitoringPlugin implements Plugin<MonitoringPluginSetup, MonitoringPluginStart> {
  private readonly logger: Logger;
  private readonly config$: Observable<any>;

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = this.initializerContext.logger.get();
    this.config$ = this.initializerContext.config.create();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('monitoring: Setup');
    const router = core.http.createRouter();

    // monitoring.nodes is deprecated - the expected node inventory is now
    // derived from opensearch.hosts automatically. Warn once at startup if
    // an old config still sets it, so it's easy to notice and remove.
    this.config$.subscribe(config => {
      if (config?.nodes?.length > 0) {
        this.logger.warn(
          'monitoring.nodes is deprecated and no longer used - the plugin now derives its ' +
            'expected node list from opensearch.hosts automatically. You can remove ' +
            'monitoring.nodes from opensearch_dashboards.yml.'
        );
      }
    });

    defineRoutes(router);

    return {};
  }

  public start(_core: CoreStart) {
    this.logger.debug('monitoring: Started');
    return {};
  }

  public stop() {
    // Cleanup logic if needed
  }
}
