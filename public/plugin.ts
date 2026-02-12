import { 
  AppMountParameters, 
  CoreSetup, 
  CoreStart, 
  Plugin, 
  DEFAULT_APP_CATEGORIES 
} from '../../../src/core/public';
import {
  MonitoringPluginSetup,
  MonitoringPluginStart,
  AppPluginStartDependencies,
} from './types';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';

import { renderApp } from './application'; 

export class MonitoringPlugin implements Plugin<MonitoringPluginSetup, MonitoringPluginStart> {
  public setup(core: CoreSetup): MonitoringPluginSetup {
    // Register the application
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      category: DEFAULT_APP_CATEGORIES.management,
      async mount(params: AppMountParameters) {
        // Get start services
        const [coreStart, depsStart] = await core.getStartServices();
        
        return renderApp(
          coreStart, 
          depsStart as AppPluginStartDependencies, 
          params
        );
      },
    });

    return {};
  }

  public start(core: CoreStart): MonitoringPluginStart {
    return {};
  }

  public stop() {
    // Stop logic if needed
  }
}
