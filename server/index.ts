import { PluginInitializerContext } from '../../../src/core/server';
import { MonitoringPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.

export function plugin(initializerContext: PluginInitializerContext) {
  return new MonitoringPlugin(initializerContext);
}

export { MonitoringPluginSetup, MonitoringPluginStart } from './types';
