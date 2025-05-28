import { AppMountParameters, CoreSetup, CoreStart, Plugin, DEFAULT_APP_CATEGORIES } from '../../../src/core/public';
import {
  MonitoringPluginSetup,
  MonitoringPluginStart,
  AppPluginStartDependencies,
} from './types';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';

export class MonitoringPlugin implements Plugin<MonitoringPluginSetup, MonitoringPluginStart> {
  public setup(core: CoreSetup): MonitoringPluginSetup {
    // Register an application into the side navigation menu
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      category: DEFAULT_APP_CATEGORIES.management,
      async mount(params: AppMountParameters) {
        // Load application bundle
        const { renderApp } = await import('./application');
        // Get start services as specified in opensearch_dashboards.json
        const [coreStart, depsStart] = await core.getStartServices();
        // Render the application
        return renderApp(coreStart, depsStart as AppPluginStartDependencies, params);
      },
    });

    // Return methods that should be available to other plugins
    return {};
  }

  public start(core: CoreStart): MonitoringPluginStart {
    return {};
  }

  public stop() {}
}
