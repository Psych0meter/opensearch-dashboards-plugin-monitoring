import { NavigationPublicPluginStart } from '../../../src/plugins/navigation/public';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MonitoringPluginSetup {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface MonitoringPluginStart {}

export interface AppPluginStartDependencies {
  navigation: NavigationPublicPluginStart;
}
