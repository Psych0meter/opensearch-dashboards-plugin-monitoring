import React, { useState, useEffect, useCallback } from 'react';
import { FormattedMessage, I18nProvider } from '@osd/i18n/react';
import { BrowserRouter as Router } from 'react-router-dom';
import {
  EuiBasicTableColumn,
  EuiFieldNumber,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
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
  EuiText,
  EuiTitle,
  EuiToolTip
} from '@elastic/eui';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../../common';
import { NetworkGraph } from './NetworkGraph';

/**
 * Interface for the dependencies required by the MonitoringApp component
 */
interface MonitoringAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  navigation: NavigationPublicPluginStart;
}

/**
 * Interface representing a cluster node
 */
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

/**
 * Interface representing cluster index recovery information
 */
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

/**
 * Interface representing cluster health information
 */
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

/**
 * Interface representing cluster configuration
 */
interface ClusterConfig {
  nodes: string[];
}

/**
 * Interface representing cluster statistics
 */
interface ClusterStats {
  cluster_name: string;
  status: string;
  version: string;
  uptime: number;
  nodes: {
    total: number;
    cluster_manager: number;
    coordinating_only: number;
    data: number;
    ingest: number;
    master: number;
    remote_cluster_client: number;
    search: number;
    warm: number;
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

/**
 * Interface representing snapshot statistics
 */
interface SnapshotStats {
  incremental: {
    file_count: number;
    size_in_bytes: number;
  };
  processed: {
    file_count: number;
    size_in_bytes: number;
  };
  total: {
    file_count: number;
    size_in_bytes: number;
  };
  start_time_in_millis: number;
  time_in_millis: number;
}

/**
 * Interface representing snapshot shard information
 */
interface SnapshotShard {
  stage: string;
  stats: {
    incremental?: {
      file_count: number;
      size_in_bytes: number;
    };
    processed?: {
      file_count: number;
      size_in_bytes: number;
    };
    total: {
      file_count: number;
      size_in_bytes: number;
    };
    start_time_in_millis: number;
    time_in_millis: number;
  };
}

/**
 * Interface representing snapshot index information
 */
interface SnapshotIndex {
  shards_stats: {
    initializing: number;
    started: number;
    finalizing: number;
    done: number;
    failed: number;
    total: number;
  };
  stats: SnapshotStats;
  shards: {
    [shardNumber: string]: SnapshotShard;
  };
}

/**
 * Interface representing a snapshot
 */
interface Snapshot {
  snapshot: string;
  repository: string;
  uuid: string;
  state: string;
  include_global_state: boolean;
  shards_stats: {
    initializing: number;
    started: number;
    finalizing: number;
    done: number;
    failed: number;
    total: number;
  };
  stats: SnapshotStats;
  indices: {
    [indexName: string]: SnapshotIndex;
  };
}

/**
 * Main monitoring application component that displays cluster health, nodes, and recovery information
 */
export const MonitoringApp = ({
  basename,
  notifications,
  http,
  navigation,
}: MonitoringAppDeps) => {

  // Helper functions for localStorage
  const getLocalStorageItem = <T,>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error reading from localStorage', error);
      return defaultValue;
    }
  };

  const setLocalStorageItem = <T,>(key: string, value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error writing to localStorage', error);
    }
  };

  // State management
  const [nodesData, setNodesData] = useState<ClusterNode[]>([]);
  const [recoveryData, setRecoveryData] = useState<ClusterIndex[]>([]);
  const [clusterHealth, setClusterHealth] = useState<ClusterHealth | null>(null);
  const [clusterStats, setClusterStats] = useState<ClusterStats | null>(null);
  const [clusterConfig, setClusterConfig] = useState<ClusterConfig | null>(null);
  const [snapshotsData, setSnapshotsData] = useState<Snapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [searchQuery, setSearchQuery] = useState('-stage:DONE');
  const [autoRefresh, setAutoRefresh] = useState(
    getLocalStorageItem(`${PLUGIN_ID}.autoRefresh`, false)
  );
  const [refreshInterval, setRefreshInterval] = useState(
    getLocalStorageItem(`${PLUGIN_ID}.refreshInterval`, 30)
  );
  const [isIntervalValid, setIsIntervalValid] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<string>('');

  const [clusterHealthLoading, setClusterHealthLoading] = useState(false);
  const [clusterStatsLoading, setClusterStatsLoading] = useState(false);
  const [clusterConfigLoading, setClusterConfigLoading] = useState(false);

  const setAutoRefreshPersisted = (value: boolean) => {
    setAutoRefresh(value);
    setLocalStorageItem(`${PLUGIN_ID}.autoRefresh`, value);
  };

  const setRefreshIntervalPersisted = (value: number) => {
    setRefreshInterval(value);
    setLocalStorageItem(`${PLUGIN_ID}.refreshInterval`, value);
  };

  const VerticalSeparator = () => (
    <div style={{
      borderLeft: '1px solid #d3dae6',
      height: '90%',
      margin: '0 16px',
      alignSelf: 'center'
    }} />
  );

  /**
   * Validates the refresh interval value
   * @param value - The interval value in seconds
   * @returns boolean - True if the interval is valid (>= 30 seconds)
   */
  const validateInterval = (value: number) => {
    const isValid = value >= 30;
    setIsIntervalValid(isValid);
    return isValid;
  };

  /**
   * Handles changes to the refresh interval input
   * @param e - The change event from the input
   */
  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    setRefreshIntervalPersisted(value);
    validateInterval(value);
  };

  /**
   * Formats bytes into a human-readable string
   * @param bytes - The number of bytes to format
   * @returns string - Formatted string with appropriate unit (KB, MB, GB, etc.)
   */
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  type TimeUnit = 'd' | 'h' | 'm' | 's' | 'ms';

  /**
   * Formats a duration in milliseconds into a human-readable string
   * @param millis - Duration in milliseconds
   * @param smallestUnit - The smallest unit to display
   * @returns string - Formatted duration string
   */
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

  /**
   * Determines the color for resource usage based on percentage
   * @param percent - Usage percentage
   * @returns string - Color code
   */
  const getUsageColor = (percent: number): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (percent < 80) return '#159D8D';
    if (percent < 90) return '#FFCE7A';
    return '#FF6666';
  };

  /**
   * Determines the color for recovery progress based on percentage
   * @param percent - Recovery percentage
   * @returns string - Color code
   */
  const getRecoveryColor = (percent: number): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (percent === 100) return '#159D8D';
    if (percent >= 50) return '#FFCE7A';
    return '#FF6666';
  };

  /**
   * Determines the color for cluster health status
   * @param health - Health status string
   * @returns string - Color code
   */
  const getHealthColor = (health: string): '#159D8D' | '#FFCE7A' | '#FF6666' => {
    if (health === 'green') return '#159D8D';
    if (health === 'yellow') return '#FFCE7A';
    return '#FF6666';
  };

  /**
   * Renders a node statistic component
   * @param count - The count to display
   * @param label - The label for the statistic
   * @returns React.ReactNode - The rendered component or null if count is invalid
   */
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
          textAlign='left'
        />
      </EuiFlexItem>
    );
  };

  // Data fetching functions
  const fetchConfig = useCallback(async () => {
    try {
      setClusterConfigLoading(true);
      const res = await http.get(`/api/${PLUGIN_ID}/config`);
      setClusterConfig(res.data);
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch configuration',
        text: err?.body?.message || 'An unexpected error occurred',
      });
    } finally {
      setClusterConfigLoading(false);
    }
  }, [http, notifications]);

  const fetchCluster = useCallback(async () => {
    try {
      setClusterHealthLoading(true);
      const res = await http.get(`/api/${PLUGIN_ID}/cluster_health`);
      setClusterHealth(res.data);
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch cluster data',
        text: err?.body?.message || 'An unexpected error occurred',
      });
    } finally {
      setClusterHealthLoading(false);
    }
  }, [http, notifications]);

  const fetchNodes = useCallback(async () => {
    try {
      setLoading(true);
      const nodes = await http.get(`/api/${PLUGIN_ID}/nodes_stats`);
      setNodesData(nodes);
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch nodes data',
        text: err?.body?.message || 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);

  const fetchRecovery = useCallback(async () => {
    try {
      setLoading(true);
      const recovData = await http.get(`/api/${PLUGIN_ID}/recovery`);
      setRecoveryData(recovData);
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch recovery data',
        text: err?.body?.message || 'An unexpected error occurred',
      });
    } finally {
      setLoading(false);
    }
  }, [http, notifications]);

  const fetchClusterStats = useCallback(async () => {
    try {
      setClusterStatsLoading(true);
      const parsedData = await http.get(`/api/${PLUGIN_ID}/cluster_stats`);
      setClusterStats(parsedData);
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch cluster stats',
        text: err?.body?.message || 'An unexpected error occurred',
      });
    } finally {
      setClusterStatsLoading(false);
    }
  }, [http, notifications]);

  const fetchSnapshots = useCallback(async () => {
    try {
      setSnapshotsLoading(true);
      const response = await http.get(`/api/${PLUGIN_ID}/snapshots`);
      
      if (response?.snapshots) {
        setSnapshotsData(response.snapshots);
      } else {
        notifications.toasts.addWarning({
          title: 'No snapshot data available',
          text: 'The snapshots API returned no data',
        });
        setSnapshotsData([]);
      }
    } catch (err) {
      notifications.toasts.addDanger({
        title: 'Failed to fetch snapshots',
        text: err?.body?.message || err.message || 'An unexpected error occurred',
      });
      setSnapshotsData([]);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [http, notifications]);

  /**
   * Toggles the display of completed recovery items
   */
  const toggleHideDone = () => {
    const newHideDone = !hideDone;
    setHideDone(newHideDone);
    setSearchQuery(newHideDone ? '-stage:DONE' : '');
  };

  /**
   * Compares configured nodes with actual nodes to find differences
   * @param configNodes - Array of configured node names
   * @param actualNodes - Array of actual cluster nodes
   * @returns Object with missingNodes and extraNodes arrays
   */
  const getNodeDifferences = (configNodes: string[], actualNodes: ClusterNode[]) => {
    const actualNodeNames = actualNodes.map(node => node.name);
    const missingNodes = configNodes.filter(name => !actualNodeNames.includes(name));
    const extraNodes = actualNodeNames.filter(name => !configNodes.includes(name));

    return { missingNodes, extraNodes };
  };

  // Effect for auto-refreshing data
  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const fetchAllData = async () => {
      try {
        await Promise.all([
          fetchCluster(),
          fetchNodes(),
          fetchRecovery(),
          fetchClusterStats(),
          fetchConfig(),
          fetchSnapshots()
        ]);
        setLastRefreshTime(new Date().toLocaleTimeString());
      } catch (error) {
        console.error('Error refreshing data:', error);
      }
    };

    // Initial fetch
    fetchAllData();

    // Set up interval if autoRefresh is enabled
    if (autoRefresh && isIntervalValid) {
      intervalId = setInterval(fetchAllData, refreshInterval * 1000);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, refreshInterval, isIntervalValid, 
      fetchCluster, fetchNodes, fetchRecovery, 
      fetchClusterStats, fetchConfig, fetchSnapshots]);

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

  const snapshotsColumns: EuiBasicTableColumn<Snapshot>[] = [
    {
      field: 'snapshot',
      name: 'Snapshot',
      sortable: true,
      render: (name: string, item: Snapshot) => (
        <EuiToolTip content={`UUID: ${item.uuid}`}>
          <span>{name}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'repository',
      name: 'Repository',
      sortable: true,
    },
    {
      field: 'state',
      name: 'State',
      sortable: true,
      render: (state: string) => (
        <span style={{ color: state === 'SUCCESS' ? '#159D8D' : '#FFCE7A' }}>
          {state}
        </span>
      ),
    },
    {
      field: 'shards_stats',
      name: 'Shards',
      render: (stats: { done: number; total: number }) => {
        const percent = Math.round((stats.done / stats.total) * 100);
        return (
          <div style={{ width: '90%' }}>
            <EuiProgress
              value={percent.toFixed(2)}
              max={100}
              size='s'
              valueText={true}
              label={`${stats.done} / ${stats.total}`}
              color={getRecoveryColor(percent)}
            />
          </div>
        );
      },
    },
    {
      field: 'stats.total.size_in_bytes',
      name: 'Total Size',
      render: (size: number) => formatBytes(size),
      sortable: true,
    },
    {
      field: 'stats.incremental.size_in_bytes',
      name: 'Incremental Size',
      render: (size: number) => (size ? formatBytes(size) : '-'),
      sortable: true,
    },
    {
      field: 'stats.time_in_millis',
      name: 'Duration',
      render: (time: number) => formatDuration(time),
      sortable: true,
    },
    {
      field: 'stats.start_time_in_millis',
      name: 'Start Time',
      render: (time: number) => new Date(time).toLocaleString(),
      sortable: true,
    },
  ];

  const renderClusterSection = () => (
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
                  title={clusterHealth ? clusterHealth.cluster_name : '--'}
                  description={
                    <span>
                      <EuiIcon type='layers' /> Name
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth ? clusterHealth.status : '--'}
                  description={
                    <span>
                      <EuiIcon type='pulse' /> Status
                    </span>
                  }
                  
                  titleColor={clusterHealth ? getHealthColor(clusterHealth.status) : 'subdued'}
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats ? formatDuration(clusterStats.uptime, 'm') : '--'}
                  description={
                    <span>
                      <EuiIcon type='clock' /> Uptime
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={
                    clusterStats ? (
                      Array.isArray(clusterStats.version) ? (
                        <span style={{ whiteSpace: 'pre-line', textAlign: 'left' }}>
                          {clusterStats.version.join('\n')}
                        </span>
                      ) : (
                        clusterStats.version
                      )
                    ) : '--'
                  }
                  description={
                    <span>
                      <EuiIcon type='number' /> Version
                      {clusterStats && Array.isArray(clusterStats.version) && clusterStats.version.length > 1 && (
                        <span style={{ fontSize: '0.8em', marginLeft: '5px' }}>
                          ({clusterStats.version.length} versions)
                        </span>
                      )}
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>
              
              <EuiFlexItem grow={false}>
                <VerticalSeparator />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={snapshotsData.length}
                  description={
                    <span>
                      <EuiIcon type="exportAction" /> Running Snapshots
                    </span>
                  }
                  descriptionElement="div"
                  titleColor={snapshotsData.length === 0 ? '#159D8D' : '#FFCE7A'}
                  textAlign="left"
                  isLoading={snapshotsLoading}
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiHorizontalRule margin='s' />

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
                          color: clusterConfig?.nodes?.length && clusterStats
                            ? clusterStats.nodes.total === clusterConfig.nodes.length
                              ? '#159D8D'
                              : '#FF6666'
                            : 'subdued',
                        }}
                      >
                        {clusterStats ? clusterStats.nodes.total : '--'}
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
                      {clusterConfig && clusterStats && 
                      (getNodeDifferences(clusterConfig.nodes, nodesData).missingNodes.length > 0 ||
                        getNodeDifferences(clusterConfig.nodes, nodesData).extraNodes.length > 0) && (
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
                  
                  textAlign='left'
                  titleElement='div'
                  isLoading={clusterStatsLoading || clusterConfigLoading}
                />
              </EuiFlexItem>

              {clusterStats ? (
                <>
                  {renderNodeStat(clusterStats.nodes.cluster_manager, 'Cluster Managers')}
                  {renderNodeStat(clusterStats.nodes.coordinating_only, 'Coordinating Only')}
                  {renderNodeStat(clusterStats.nodes.data, 'Data')}
                  {renderNodeStat(clusterStats.nodes.ingest, 'Ingest')}
                  {renderNodeStat(clusterStats.nodes.master, 'Master')}
                  {renderNodeStat(clusterStats.nodes.remote_cluster_client, 'Remote Cluster Client')}
                  {renderNodeStat(clusterStats.nodes.search, 'Search')}
                  {renderNodeStat(clusterStats.nodes.warm, 'Warm')}
                </>
              ) : (
                // Show loading placeholders for node stats
                Array.from({ length: 8 }).map((_, i) => (
                  <EuiFlexItem grow={false} key={`placeholder-${i}`}>
                    <EuiStat
                      title="--"
                      description={<span><EuiIcon type='node' /> Loading...</span>}
                      
                      textAlign='left'
                      isLoading={true}
                    />
                  </EuiFlexItem>
                ))
              )}

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={
                    clusterStats ? (
                      <div>
                        <span style={{ color: getUsageColor(clusterStats.fs.percent) }}>
                          {clusterStats.fs.percent.toFixed(2)}%
                        </span>
                        <div style={{ fontSize: '0.5em', color: '#666' }}>
                          {`${formatBytes(clusterStats.fs.used)} / ${formatBytes(clusterStats.fs.total)}`}
                        </div>
                      </div>
                    ) : '--'
                  }
                  description={
                    <span>
                      <EuiIcon type='storage' /> Storage Usage
                    </span>
                  }
                  
                  textAlign='left'
                  titleElement='div'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={
                    clusterStats ? (
                      <div>
                        <span style={{ color: getUsageColor(clusterStats.jvm.mem.percent) }}>
                          {clusterStats.jvm.mem.percent.toFixed(2)}%
                        </span>
                        <div style={{ fontSize: '0.5em', color: '#666' }}>
                          {`${formatBytes(clusterStats.jvm.mem.used)} / ${formatBytes(clusterStats.jvm.mem.total)}`}
                        </div>
                      </div>
                    ) : '--'
                  }
                  description={
                    <span>
                      <EuiIcon type='memory' /> JVM Heap
                    </span>
                  }
                  
                  textAlign='left'
                  titleElement='div'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats ? clusterStats.jvm.threads : '--'}
                  description={
                    <span>
                      <EuiIcon type='logstashIf' /> JVM Threads
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiHorizontalRule margin='s' />

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
                  title={clusterStats?.indices?.shards?.total ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Total Shards
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth?.active_primary_shards?.toString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Primary Shards
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth ? (clusterHealth.active_shards - clusterHealth.active_primary_shards).toLocaleString() : '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Replica Shards
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats?.indices?.shards?.replication ? `${(clusterStats.indices.shards.replication * 100).toFixed(2)}%` : '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Replication Factor
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats?.indices?.segments?.count?.toLocaleString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='partial' /> Segments
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth?.unassigned_shards?.toString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Unassigned Shards
                    </span>
                  }
                  
                  titleColor={clusterHealth?.unassigned_shards > 0 ? '#FF6666' : '#159D8D'}
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth?.initializing_shards?.toString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Initializing Shards
                    </span>
                  }
                  
                  titleColor={clusterHealth?.initializing_shards > 0 ? '#FF6666' : '#159D8D'}
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterHealth?.active_shards_percent_as_number ? `${clusterHealth.active_shards_percent_as_number.toFixed(2)}%` : '--'}
                  description={
                    <span>
                      <EuiIcon type='shard' /> Active Shards (%)
                    </span>
                  }
                  
                  titleColor={clusterHealth?.active_shards_percent_as_number < 100 ? '#FF6666' : '#159D8D'}
                  textAlign='left'
                  isLoading={clusterHealthLoading}
                />
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiHorizontalRule margin='s' />

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
                  title={clusterStats?.indices?.count ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='indexSettings' /> Total Indices
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats?.indices?.docs?.count?.toLocaleString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='document' /> Documents
                    </span>
                  }
                   
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats?.indices?.docs?.deleted?.toLocaleString() ?? '--'}
                  description={
                    <span>
                      <EuiIcon type='document' /> Deleted Docs
                    </span>
                  }
                   
                  textAlign='left'
                  isLoading={clusterStatsLoading}
                />
              </EuiFlexItem>

              <EuiFlexItem grow={false}>
                <EuiStat
                  title={clusterStats?.indices?.store?.size_in_bytes ? formatBytes(clusterStats.indices.store.size_in_bytes) : '--'}
                  description={
                    <span>
                      <EuiIcon type='storage' /> Storage Used
                    </span>
                  }
                  
                  textAlign='left'
                  isLoading={clusterStatsLoading}
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
            {nodesData.length > 0 ? (
              <NetworkGraph nodes={nodesData} />
            ) : (
              <EuiText textAlign="center">
                <EuiIcon type="visualizeApp" size="xl" />
                <p>Loading node graph...</p>
              </EuiText>
            )}
          </EuiPageContentBody>
        </EuiPageContent>
      </EuiFlexItem>
    </EuiFlexGroup>
  );

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

                <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
                  <EuiFlexItem grow={false}>
                    <EuiTitle size="l">
                      <h1>
                        <EuiIcon type='anomalyDetection' size="l"/>&nbsp;
                        <FormattedMessage
                          id='{PLUGIN_ID}pluginTitle'
                          defaultMessage='{name}'
                          values={{ name: PLUGIN_NAME }}
                        />
                      </h1>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup alignItems="center" gutterSize="s">
                      {lastRefreshTime && (
                        <EuiFlexItem grow={false}>
                          <EuiText color="subdued" size="s">
                            Last update: {lastRefreshTime}
                          </EuiText>
                        </EuiFlexItem>
                      )}
                      <EuiFlexItem grow={false}>
                        <EuiSwitch
                          label="Auto-refresh"
                          checked={autoRefresh}
                          onChange={() => setAutoRefreshPersisted(!autoRefresh)}
                        />
                      </EuiFlexItem>
                      {autoRefresh && (
                        <EuiFlexItem grow={false} style={{ width: '125px' }}>
                          <EuiFieldNumber
                            placeholder="Interval (seconds)"
                            value={refreshInterval}
                            onChange={handleIntervalChange}
                            min={30}
                            step={5}
                            isInvalid={!isIntervalValid}
                            append={<EuiText size="xs"><span>sec</span></EuiText>}
                            disabled={!autoRefresh}
                          />
                        </EuiFlexItem>
                      )}
                      {autoRefresh && !isIntervalValid && (
                        <EuiFlexItem grow={false}>
                          <EuiText color="danger" size="xs">
                            Minimum interval is 30 seconds
                          </EuiText>
                        </EuiFlexItem>
                      )}
                    </EuiFlexGroup>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPageHeader>

              {renderClusterSection()}

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
                        id='{PLUGIN_ID}snapshotsTitle'
                        defaultMessage='Running Snapshots'
                      />
                    </h2>
                  </EuiTitle>
                </EuiPageContentHeader>
                <EuiPageContentBody>
                  <EuiInMemoryTable
                    tableCaption='OpenSearch Running Snapshots'
                    items={snapshotsData}
                    columns={snapshotsColumns}
                    loading={snapshotsLoading}
                    pagination={true}
                    sorting={{
                      sort: {
                        field: 'stats.start_time_in_millis',
                        direction: 'desc',
                      },
                    }}
                    search={{
                      box: {
                        incremental: true,
                        placeholder: 'Search...',
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
