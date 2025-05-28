import { PluginInitializerContext } from '../../../src/core/server';
import { MonitoringPlugin } from './plugin';
import { config } from './config';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.

export function plugin(initializerContext: PluginInitializerContext) {
  return new MonitoringPlugin(initializerContext);
}

// Export the config schema for OpenSearch Dashboards to recognize your config keys
export { config };

export { MonitoringPluginSetup, MonitoringPluginStart } from './types';
