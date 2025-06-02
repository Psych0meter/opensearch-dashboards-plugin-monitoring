import React, { useState, useEffect, useCallback } from 'react';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import { BrowserRouter as Router } from 'react-router-dom';
import {
  EuiBasicTableColumn,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPageContentBody,
  EuiPageContentHeader,
  EuiPageHeader,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiSwitch,
  EuiTitle,
  EuiToolTip
} from '@elastic/eui';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../../common';

import { NetworkGraph } from './NetworkGraph';


interface MonitoringAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  navigation: NavigationPublicPluginStart;
}

interface ClusterNode {
  id: string;
  name: string;
  host: string;
  roles: string[];
  zone: string;
  cpu: { percent: number };
  mem: { total: number; used: number; percent: number };
  swap: { total: number; used: number; percent: number };
  fs: { total: number; used: number; percent: number };
}

interface ClusterIndex {
  index: string;
  shard: number;
  time: number;
  type: string;
  stage: string;
  source_host: string;
  source_node: string;
  target_host: string;
  target_node: string;
  files: number;
  files_recovered: number;
  files_percent: string;
  files_total: number;
  bytes: number;
  bytes_recovered: number;
  bytes_percent: string;
  bytes_total: number;
  translog_recovered: number;
  translog_percent: string;
  translog_total: number;
}

interface ClusterHealth {
  cluster_name: string;
  status: string;
  number_of_nodes: number;
  number_of_data_nodes: number;
  active_primary_shards: number;
  active_shards: number;
  unassigned_shards: number;
  initializing_shards: number;
  active_shards_percent_as_number: number;
}

interface ClusterConfig {
  nodes: [];
  // enabled: boolean;
}


interface ClusterStats {
  cluster_name: string;
  status: string;
  version: string;
  uptime: number;
  nodes: {
   total: number; cluster_manager: number, coordinating_only: number, data: number, ingest: number, master: number, remote_cluster_client: number, search: number, warm: number;
  };
  jvm: {
    mem: { used: number; total: number; percent: number };
    threads: number;
  };
  fs: {
    used: number;
    total: number;
    percent: number;
  };
  indices: {
    count: number;
    shards: {
      total: number;
      primaries: number;
      replication: number;
    };
    docs: {
      count: number;
      deleted: number;
    };
    store: {
      size_in_bytes: number;
    };
    segments: {
      count: number;
    };
  };
}

export const MonitoringApp = ({
  basename,
  notifications,
  http,
  navigation,
}: MonitoringAppDeps) => {
  const [nodesData, setNodesData] = useState<ClusterNode[]>([]);
  const [recoveryData, setRecoveryData] = useState<ClusterIndex[]>([]);
  const [clusterHealth, setClusterHealth] = useState<ClusterHealth | null>(null);
  const [clusterStats, setClusterStats] = useState<ClusterStats | null>(null);
  const [clusterConfig, setClusterConfig] = useState<ClusterConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [searchQuery, setSearchQuery] = useState('-stage:DONE');
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Utility functions
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  type TimeUnit = 'd' | 'h' | 'm' | 's' | 'ms';

  const formatDuration = (millis: number, smallestUnit: TimeUnit = 'ms'): string => {
    const seconds = Math.floor(millis / 1000);
    const days = Math.floor(seconds / (3600 * 24));
    const hours = Math.floor((seconds % (3600 * 24)) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const remainingMillis = millis % 1000;

    const unitOrder: TimeUnit[] = ['d', 'h', 'm', 's', 'ms'];
    const minIndex = unitOrder.indexOf(smallestUnit);

    const parts = [];
    if (minIndex >= 0 && days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (minIndex >= 1 && hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minIndex >= 2 && minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (minIndex >= 3 && secs > 0) parts.push(`${secs} second${secs !== 1 ? 's' : ''}`);
    if ((remainingMillis > 0 || parts.length === 0) && minIndex >= 4)
      parts.push(`${remainingMillis} millisecond${remainingMillis !== 1 ? 's' : ''}`);

    return parts.join(' ');
  };

  const getUsageColor = (percent: number): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (percent < 80) return '#159D8D';
    if (percent < 90) return '#FFCE7A';
    return '#FF6666';
  };

  const getRecoveryColor = (percent: number): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (percent === 100) return '#159D8D';
    if (percent >= 50) return '#FFCE7A';
    return '#FF6666';
  };

  const getHealthColor = (health: string): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (health === 'green') return '#159D8D';
    if (health === 'yellow') return '#FFCE7A';
    return '#FF6666';
  };

  const renderNodeStat = (count: number, label: string): React.ReactNode => {
    if ((count <= 0) || (!count)) return null;

    return (
      <EuiFlexItem grow={false} key={label}>
        <EuiStat
          title={count}
          description={
            <span>
              <EuiIcon type='node' /> {label}
            </span>
          }
          descriptionElement='div'
          textAlign='left'
        />
      </EuiFlexItem>
    );
  };

  // Data fetching functions
  const fetchConfig = useCallback(async () => {
    try {
      const res = await http.get('/api/' + PLUGIN_ID + '/config');
      setClusterConfig(res.data);
    } catch (err) {
      if (err?.body?.message) {
        notifications.toasts.addDanger({
          title: 'Failed to fetch configuration',
          text: err?.body?.message || 'An unexpected error occurred',
        });
      } else {
        notifications.toasts.addDanger('Failed to fetch configuration');
      }
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);

  // Data fetching functions
  const fetchCluster = useCallback(async () => {
    try {
      setLoading(true);
      const res = await http.get('/api/' + PLUGIN_ID + '/cluster_health');
      setClusterHealth(res.data);
    } catch (err) {
      if (err?.body?.message) {
        notifications.toasts.addDanger({
          title: 'Failed to fetch cluster data',
          text: err?.body?.message || 'An unexpected error occurred',
        });
      } else {
        notifications.toasts.addDanger('Failed to fetch cluster data');
      }
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);


  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await http.get('/api/' + PLUGIN_ID + '/nodes_stats');
      setNodesData(nodes); // Already formatted
    } catch (err) {
      if (err?.body?.message) {
        notifications.toasts.addDanger({
          title: 'Failed to fetch nodes data',
          text: err?.body?.message || 'An unexpected error occurred',
        });
      } else {
        notifications.toasts.addDanger('Failed to fetch nodes data');
      }
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);

  const fetchRecovery = useCallback(async () => {
    try {
      setLoading(true);
      const recovData = await http.get('/api/' + PLUGIN_ID + '/recovery');
      setRecoveryData(recovData);
    } catch (err) {
      if (err?.body?.message) {
        notifications.toasts.addDanger({
          title: 'Failed to fetch recovery data',
          text: err?.body?.message || 'An unexpected error occurred',
        });
      } else {
        notifications.toasts.addDanger('Failed to fetch recovery data');
      }
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);

  const fetchClusterStats = useCallback(async () => {
    try {
      setLoading(true);
      const parsedData = await http.get('/api/' + PLUGIN_ID + '/cluster_stats');
      setClusterStats(parsedData);
    } catch (err) {
      if (err?.body?.message) {
        notifications.toasts.addDanger({
          title: 'Failed to fetch cluster stats',
          text: err?.body?.message || 'An unexpected error occurred',
        });
      } else {
        notifications.toasts.addDanger('Failed to fetch cluster stats');
      }
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);


  // Event handlers
  const toggleHideDone = () => {
    const newHideDone = !hideDone;
    setHideDone(newHideDone);
    setSearchQuery(newHideDone ? '-stage:DONE' : '');
  };

  const getNodeDifferences = (configNodes: string[], actualNodes: ClusterNode[]) => {
    const actualNodeNames = actualNodes.map(node => node.name);
    const missingNodes = configNodes.filter(name => !actualNodeNames.includes(name));
    const extraNodes = actualNodeNames.filter(name => !configNodes.includes(name));

    return { missingNodes, extraNodes };
  };

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    if (autoRefresh) {

      intervalId = setInterval(() => {
        fetchCluster();
        fetchNodes();
        fetchRecovery();
        fetchClusterStats();
        fetchConfig();
      }, 30000); // 30 seconds
    } else {

      fetchCluster();
      fetchNodes();
      fetchRecovery();
      fetchClusterStats();
      fetchConfig();

    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, fetchCluster, fetchNodes, fetchRecovery, fetchClusterStats, fetchConfig]);

  // Table columns configuration
  const nodesColumns: EuiBasicTableColumn<ClusterNode>[] = [
    { field: 'name', name: 'Node Name', sortable: true },
    { field: 'host', name: 'Host', sortable: true },
    {
      field: 'roles',
      name: 'Roles',
      render: (roles: string[]) => <div style={{ whiteSpace: 'pre-line' }}>{roles.join('\n')}</div>
    },
    { field: 'zone', name: 'Zone', sortable: true },
    {
      field: 'cpu',
      name: 'CPU',
      render: (cpu: { percent: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={cpu.percent}
            max={100}
            size='s'
            valueText={true}
            color={getUsageColor(cpu.percent)}
          />
        </div>
      ),
    },
    {
      field: 'mem',
      name: 'Memory',
      render: (mem: { percent: number; used: number; total: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={mem.percent.toFixed(2)}
            max={100}
            size='s'
            valueText={true}
            label={`${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}
            color={getUsageColor(mem.percent)}
          />
        </div>
      ),
    },
    {
      field: 'swap',
      name: 'SWAP',
      render: (swap: { percent: number; used: number; total: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={swap.percent.toFixed(2)}
            max={100}
            size='s'
            valueText={true}
            label={`${formatBytes(swap.used)} / ${formatBytes(swap.total)}`}
            color={getUsageColor(swap.percent)}
          />
        </div>
      ),
    },
    {
      field: 'fs',
      name: 'Filesystem',
      render: (fs: { percent: number; used: number; total: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={fs.percent.toFixed(2)}
            max={100}
            size='s'
            valueText={true}
            label={`${formatBytes(fs.used)} / ${formatBytes(fs.total)}`}
            color={getUsageColor(fs.percent)}
          />
        </div>
      ),
    },
  ];

  const recoveryColumns: EuiBasicTableColumn<ClusterIndex>[] = [
    { field: 'index', name: 'Index', sortable: true },
    { field: 'shard', name: 'Shard', sortable: true },
    { field: 'type', name: 'Type', sortable: true },
    { field: 'stage', name: 'Stage', sortable: true },
    { field: 'source_node', name: 'Source Node', sortable: true },
    { field: 'target_node', name: 'Target Node', sortable: true },
    {
      field: 'files_percent',
      name: 'Files',
      render: (percent: string, item: ClusterIndex) => {
        if (percent === '-') return '-';
        const numeric = parseFloat(percent);
        const label = numeric === 100
          ? `${item.files_total}`
          : `${item.files_recovered} / ${item.files_total}`;

        return (
          <div style={{ width: '90%' }}>
            <EuiProgress
              value={numeric.toFixed(2)}
              max={100}
              size='s'
              valueText
              label={label}
              color={getRecoveryColor(numeric)}
            />
          </div>
        );
      },
      sortable: true
    },
    {
      field: 'bytes_percent',
      name: 'Size',
      render: (percent: string, item: ClusterIndex) => {
        if (percent === '-') return '-';
        const numeric = parseFloat(percent);
        const label = numeric === 100
          ? `${formatBytes(Number(item.bytes_total))}`
          : `${formatBytes(Number(item.bytes_recovered))} / ${formatBytes(Number(item.bytes_total))}`;

        return (
          <div style={{ width: '90%' }}>
            <EuiProgress
              value={numeric.toFixed(2)}
              max={100}
              size='s'
              valueText
              label={label}
              color={getRecoveryColor(numeric)}
            />
          </div>
        );
      },
      sortable: true
    },
    {
      field: 'translog_percent',
      name: 'Translog',
      render: (percent: string, item: ClusterIndex) => {
        if (percent === '-') return '-';
        const numeric = parseFloat(percent);
        const label = numeric === 100
          ? `${item.translog_total}`
          : `${item.translog_recovered} / ${item.translog_total}`;
        return (
          <div style={{ width: '90%' }}>
            <EuiProgress
              value={numeric.toFixed(2)}
              max={100}
              size='s'
              valueText
              label={label}
              color={getRecoveryColor(numeric)}
            />
          </div>
        );
      },
      sortable: true
    },
      {
      field: 'time',
      name: 'Elapsed Time',
      render: (time: number) => {
        if (time === 0) return '-';
        return formatDuration(time);
      },
      sortable: true
    },
  ];

  return (
    <Router basename={basename}>
      <I18nProvider>
        <>
          <navigation.ui.TopNavMenu
            appName={PLUGIN_ID}
            showSearchBar={false}
            useDefaultBehaviors={true}
          />

          <EuiPage>
            <EuiPageBody component='main'>
              <EuiPageHeader>
                <EuiTitle size='l'>
                  <h1>
                    <FormattedMessage
                      id='{PLUGIN_ID}pluginTitle'
                      defaultMessage='{name}'
                      values={{ name: PLUGIN_NAME }}
                    />
                  </h1>
                </EuiTitle>
                <EuiFlexItem grow={false}>
                  <EuiSwitch
                    label='Auto-refresh (30s)'
                    checked={autoRefresh}
                    onChange={() => setAutoRefresh(!autoRefresh)}
                  />
                </EuiFlexItem>
              </EuiPageHeader>

              {clusterHealth && clusterStats && clusterConfig && (
              <EuiFlexGroup>
                <EuiFlexItem>
                  <EuiPageContent>
                    <EuiPageContentHeader>
                      <EuiTitle size='m'>
                        <h2>
                          <FormattedMessage
                            id='{PLUGIN_ID}clusterTitle'
                            defaultMessage='Cluster'
                          />
                        </h2>
                      </EuiTitle>
                    </EuiPageContentHeader>

                    <EuiPageContentBody>
                      <EuiFlexGroup wrap gutterSize='xl'>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterHealth.cluster_name}
                            description={
                              <span>
                                <EuiIcon type='layers' /> Name
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterHealth.status}
                            description={
                              <span>
                                <EuiIcon type='pulse' /> Status
                              </span>
                            }
                            descriptionElement='div'
                            titleColor={getHealthColor(clusterHealth.status)}
                            textAlign='left'
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={formatDuration(clusterStats.uptime, 'm')}
                            description={
                              <span>
                                <EuiIcon type='clock' /> Uptime
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.version}
                            description={
                              <span>
                                <EuiIcon type='number' /> Version
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>

                      <EuiSpacer size='l' />

                      <EuiPageContentHeader>
                        <EuiTitle size='m'>
                          <h2>
                            <FormattedMessage
                              id='{PLUGIN_ID}nodesTitle'
                              defaultMessage='Nodes'
                            />
                          </h2>
                        </EuiTitle>
                      </EuiPageContentHeader>

                      <EuiFlexGroup wrap gutterSize='xl'>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={
                              <div>
                                <span
                                  style={{
                                    color: clusterConfig?.nodes?.length
                                      ? clusterStats.nodes.total === clusterConfig.nodes.length
                                        ? '#159D8D'
                                        : '#FF6666'
                                      : undefined,
                                  }}
                                >
                                  {clusterStats.nodes.total}
                                </span>
                                {clusterConfig?.nodes?.length > 0 && (
                                  <span style={{ fontSize: '0.5em', color: '#666' }}>
                                    {' '}
                                    / {clusterConfig.nodes.length}
                                  </span>
                                )}
                              </div>
                            }
                            description={
                              <span>
                                <EuiIcon type='node' /> Active
                                {((getNodeDifferences(clusterConfig.nodes, nodesData).missingNodes.length > 0 ||
                                          getNodeDifferences(clusterConfig.nodes, nodesData).extraNodes.length > 0) && clusterConfig?.nodes?.length > 0) && (
                                  <EuiToolTip
                                    position='bottom'
                                    content={
                                      <div>
                                        {getNodeDifferences(clusterConfig.nodes, nodesData).missingNodes.length > 0 && (
                                          <div>
                                            <strong>Missing nodes:</strong>
                                            <ul>
                                              {getNodeDifferences(clusterConfig.nodes, nodesData).missingNodes.map(node => (
                                                <li key={node}>{node}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {getNodeDifferences(clusterConfig.nodes, nodesData).extraNodes.length > 0 && (
                                          <div>
                                            <strong>Unexpected nodes:</strong>
                                            <ul>
                                              {getNodeDifferences(clusterConfig.nodes, nodesData).extraNodes.map(node => (
                                                <li key={node}>{node}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    }
                                  >

                                    <EuiIcon
                                      type='alert'
                                      color='danger'
                                      style={{ marginLeft: '5px' }}
                                    />
                                  </EuiToolTip>
                                )}
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                            titleElement='div'
                          />
                        </EuiFlexItem>

                        {renderNodeStat(clusterStats.nodes.cluster_manager, 'Cluster Managers')}
                        {renderNodeStat(clusterStats.nodes.coordinating_only, 'Coordinating Only')}
                        {renderNodeStat(clusterStats.nodes.data, 'Data')}
                        {renderNodeStat(clusterStats.nodes.ingest, 'Ingest')}
                        {renderNodeStat(clusterStats.nodes.master, 'Master')}
                        {renderNodeStat(clusterStats.nodes.remote_cluster_client, 'Remote Cluster Client')}
                        {renderNodeStat(clusterStats.nodes.search, 'Search')}
                        {renderNodeStat(clusterStats.nodes.warm, 'Warm')}


                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={
                              <div>
                                <span style={{ color: getUsageColor(clusterStats.fs.percent) }}>{clusterStats.fs.percent.toFixed(2)}%
                                </span>
                                <div style={{ fontSize: '0.5em', color: '#666' }}>
                                  {`${formatBytes(clusterStats.fs.used)} / ${formatBytes(clusterStats.fs.total)}`}
                                </div>
                              </div>
                            }
                            description={
                              <span>
                                <EuiIcon type='storage' /> Storage Usage
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                            titleElement='div'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={
                              <div>
                                <span style={{ color: getUsageColor(clusterStats.jvm.mem.percent) }}>{clusterStats.jvm.mem.percent.toFixed(2)}%
                                </span>
                                <div style={{ fontSize: '0.5em', color: '#666' }}>
                                  {`${formatBytes(clusterStats.jvm.mem.used)} / ${formatBytes(clusterStats.jvm.mem.total)}`}
                                </div>
                              </div>
                            }
                            description={
                              <span>
                                <EuiIcon type='memory' /> JVM Heap
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                            titleElement='div'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.jvm.threads}
                            description={
                              <span>
                                <EuiIcon type='logstashIf' /> JVM Threads
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>

                      <EuiSpacer size='l' />

                      <EuiPageContentHeader>
                        <EuiTitle size='m'>
                          <h2>
                            <FormattedMessage
                              id='{PLUGIN_ID}shardsTitle'
                              defaultMessage='Shards'
                            />
                          </h2>
                        </EuiTitle>
                      </EuiPageContentHeader>

                      <EuiFlexGroup wrap gutterSize='xl'>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.indices.shards.total}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Total Shards
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterHealth.active_primary_shards.toString()}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Primary Shards
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={(clusterHealth.active_shards - clusterHealth.active_primary_shards).toLocaleString()}
                                        description={
                                          <span>
                                            <EuiIcon type='shard' /> Replica Shards
                                          </span>
                                        }
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={`${(clusterStats.indices.shards.replication * 100).toFixed(2)}%`}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Replication Factor
                              </span>
                            }
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.indices.segments.count.toLocaleString()}
                            description={
                              <span>
                                <EuiIcon type='partial' /> Segments
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterHealth.unassigned_shards.toString()}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Unassigned Shards
                              </span>
                            }
                            descriptionElement='div'
                            titleColor={clusterHealth.unassigned_shards > 0 ? '#FF6666' : '#159D8D'}
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterHealth.initializing_shards.toString()}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Initializing Shards
                              </span>
                            }
                            descriptionElement='div'
                            titleColor={clusterHealth.initializing_shards > 0 ? '#FF6666' : '#159D8D'}
                            textAlign='left'
                          />
                        </EuiFlexItem>

                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={`${clusterHealth.active_shards_percent_as_number.toFixed(2)}%`}
                            description={
                              <span>
                                <EuiIcon type='shard' /> Active Shards (%)
                              </span>
                            }
                            descriptionElement='div'
                            titleColor={clusterHealth.active_shards_percent_as_number < 100 ? '#FF6666' : '#159D8D'}
                            textAlign='left'
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>

                      <EuiSpacer size='l' />

                      <EuiPageContentHeader>
                        <EuiTitle size='m'>
                          <h2>
                            <FormattedMessage
                              id='{PLUGIN_ID}indicesTitle'
                              defaultMessage='Indices'
                            />
                          </h2>
                        </EuiTitle>
                      </EuiPageContentHeader>

                      <EuiFlexGroup wrap gutterSize='xl'>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.indices.count}
                            description={
                              <span>
                                <EuiIcon type='indexSettings' /> Total Indices
                              </span>
                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.indices.docs.count.toLocaleString()}
                            description={
                              <span>
                                <EuiIcon type='document' /> Documents
                              </span>
                            }
                            textAlign='left'
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={clusterStats.indices.docs.deleted.toLocaleString()}
                            description={
                              <span>
                                <EuiIcon type='document' /> Deleted Docs
                              </span>
                            }
                            textAlign='left'
                          />
                        </EuiFlexItem>


                        <EuiFlexItem grow={false}>
                          <EuiStat
                            title={formatBytes(clusterStats.indices.store.size_in_bytes)}
                            description={
                              <span>
                                <EuiIcon type='storage' /> Storage Used
                              </span>

                            }
                            descriptionElement='div'
                            textAlign='left'
                          />
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiPageContentBody>
                  </EuiPageContent>
                </EuiFlexItem>

                <EuiSpacer size='l' />

                <EuiFlexItem grow={false}>
                  <EuiPageContent grow={false}>
                    <EuiPageContentHeader>
                      <EuiTitle size='m'>
                        <h2>
                          <FormattedMessage
                            id='{PLUGIN_ID}graphViewTitle'
                            defaultMessage='Graph View'
                          />
                        </h2>
                      </EuiTitle>
                    </EuiPageContentHeader>

                    <EuiPageContentBody>
                      <NetworkGraph nodes={nodesData} />
                    </EuiPageContentBody>
                  </EuiPageContent>
                </EuiFlexItem>
              </EuiFlexGroup>
              )}

              <EuiSpacer size='l' />

              <EuiPageContent>
                <EuiPageContentHeader>
                  <EuiTitle>
                    <h2>
                      <FormattedMessage
                        id='{PLUGIN_ID}clusterNodesTitle'
                        defaultMessage='Cluster Nodes'
                      />
                    </h2>
                  </EuiTitle>
                </EuiPageContentHeader>
                <EuiPageContentBody>
                  <EuiInMemoryTable
                    tableCaption='OpenSearch Cluster Nodes'
                    items={nodesData}
                    columns={nodesColumns}
                    loading={loading}
                    pagination={true}
                    sorting={{
                      sort: {
                        field: 'name',
                        direction: 'asc',
                      },
                    }}
                    search={{
                      box: {
                        incremental: true,
                      },
                    }}
                  />
                </EuiPageContentBody>
              </EuiPageContent>

              <EuiSpacer size='l' />

              <EuiPageContent>
                <EuiPageContentHeader>
                  <EuiTitle>
                    <h2>
                      <FormattedMessage
                        id='{PLUGIN_ID}shardsRecoveryTitle'
                        defaultMessage='Shards Recovery'
                      />
                    </h2>
                  </EuiTitle>
                </EuiPageContentHeader>
                <EuiPageContentBody>
                  <EuiFlexGroup justifyContent='flexEnd' alignItems='center'>
                    <EuiFlexItem grow={false}>
                      <EuiSwitch
                        label='Hide completed items'
                        checked={hideDone}
                        onChange={toggleHideDone}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>

                  <EuiSpacer size='m' />

                  <EuiInMemoryTable
                    tableCaption='OpenSearch Shards Recovery'
                    items={recoveryData}
                    columns={recoveryColumns}
                    loading={loading}
                    pagination={true}
                    sorting={{
                      sort: {
                        field: 'index',
                        direction: 'asc',
                      },
                    }}
                    search={{
                      query: searchQuery,
                      onChange: ({ query }) => setSearchQuery(query ? query.text : ''),
                      box: {
                        incremental: true,
                        placeholder: hideDone
                          ? 'Search (excluding completed items)'
                          : 'Search all items',
                      },
                    }}
                  />
                </EuiPageContentBody>
              </EuiPageContent>
            </EuiPageBody>
          </EuiPage>
        </>
      </I18nProvider>
    </Router>
  );
};
