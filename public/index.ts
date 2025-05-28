import './index.scss';

import { MonitoringPlugin } from './plugin';

// This exports static code and TypeScript types,
// as well as, OpenSearch Dashboards Platform `plugin()` initializer.
export function plugin() {
  return new MonitoringPlugin();
}
export { MonitoringPluginSetup, MonitoringPluginStart } from './types';
