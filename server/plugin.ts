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
  private config: any | undefined; // Store the config here

  constructor(private readonly initializerContext: PluginInitializerContext) {
    this.logger = this.initializerContext.logger.get();
    this.config$ = this.initializerContext.config.create();
  }

  public setup(core: CoreSetup) {
    this.logger.debug('monitoring: Setup');
    const router = core.http.createRouter();

    // Subscribe once and store the config for later use
    this.config$.subscribe(config => {
      this.config = config;
      this.logger.info(`monitoring config at setup: ${JSON.stringify(config)}`);
    });

    // Pass the config to your routes or use it elsewhere
    defineRoutes(router, () => this.config);

    return {};
  }

  public start(core: CoreStart) {
    this.logger.debug('monitoring: Started');
    return {};
  }

  public stop() {
    // Cleanup logic if needed
  }
}
