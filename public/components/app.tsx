import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  EuiToolTip,
  euiPaletteColorBlind,
  euiPaletteForStatus,
  euiPaletteGray,
} from '@elastic/eui';

import { CoreStart } from '../../../../src/core/public';
import { NavigationPublicPluginStart } from '../../../../src/plugins/navigation/public';
import {
  PLUGIN_ID,
  PLUGIN_NAME,
  ClusterStatsSummary as ClusterStats,
  NodeStats as ClusterNode,
  RecoveryStats as ClusterIndex,
  ExpectedHost,
  compareInventory,
} from '../../common';
import { NetworkGraph } from './NetworkGraph';
import {
  MIN_REFRESH_INTERVAL_SECONDS,
  parseRefreshInterval,
  sanitizeStoredInterval,
  singleFlight,
  startPolling,
} from '../refresh';

const STATUS_PALETTE = euiPaletteForStatus(3);
const [STATUS_GOOD, STATUS_WARNING, STATUS_DANGER] = STATUS_PALETTE;

const SUBDUED_TEXT_COLOR = euiPaletteGray(3)[1];
const BORDER_COLOR = euiPaletteGray(5)[0];
const INFO_COLOR = euiPaletteColorBlind()[1];

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
  hosts: ExpectedHost[];
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
  const [nodesLoading, setNodesLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [hideDone, setHideDone] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(
    getLocalStorageItem<unknown>(`${PLUGIN_ID}.autoRefresh`, false) === true
  );
  // `refreshInterval` is always a valid interval; `intervalInput` holds
  // whatever is being typed, and is only committed once it parses.
  const [refreshInterval, setRefreshInterval] = useState(() =>
    sanitizeStoredInterval(getLocalStorageItem<unknown>(`${PLUGIN_ID}.refreshInterval`, null))
  );
  const [intervalInput, setIntervalInput] = useState(() => String(refreshInterval));
  const isIntervalValid = parseRefreshInterval(intervalInput) !== null;
  const [lastSuccessTime, setLastSuccessTime] = useState<Date | null>(null);
  const [lastAttemptTime, setLastAttemptTime] = useState<Date | null>(null);
  const [failedSources, setFailedSources] = useState<string[]>([]);

  const [clusterHealthLoading, setClusterHealthLoading] = useState(false);
  const [clusterStatsLoading, setClusterStatsLoading] = useState(false);
  const [clusterConfigLoading, setClusterConfigLoading] = useState(false);

  const setAutoRefreshPersisted = (value: boolean) => {
    setAutoRefresh(value);
    setLocalStorageItem(`${PLUGIN_ID}.autoRefresh`, value);
  };

  const VerticalSeparator = () => (
    <div style={{
      borderLeft: `1px solid ${BORDER_COLOR}`,
      height: '90%',
      margin: '0 16px',
      alignSelf: 'center'
    }} />
  );

  /**
   * Handles changes to the refresh interval input. Invalid values (empty,
   * non-numeric, below the minimum) are shown as invalid but never applied
   * or persisted, so the polling loop always runs on a valid interval.
   */
  const handleIntervalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setIntervalInput(raw);
    const parsed = parseRefreshInterval(raw);
    if (parsed !== null) {
      setRefreshInterval(parsed);
      setLocalStorageItem(`${PLUGIN_ID}.refreshInterval`, parsed);
    }
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

    if (parts.length === 0) {
      const unitNames: Record<TimeUnit, string> = {
        d: 'day', h: 'hour', m: 'minute', s: 'second', ms: 'millisecond',
      };
      return `< 1 ${unitNames[smallestUnit]}`;
    }
    return parts.join(' ');
  };

  /**
   * Determines the color for resource usage based on percentage
   * @param percent - Usage percentage
   * @returns string - Color code
   */
  const getUsageColor = (percent: number): string => {
    if (percent < 80) return STATUS_GOOD;
    if (percent < 90) return STATUS_WARNING;
    return STATUS_DANGER;
  };

  /**
   * Determines the color for recovery progress based on percentage
   * @param percent - Recovery percentage
   * @returns string - Color code
   */
  const getRecoveryColor = (percent: number): string => {
    if (percent === 100) return STATUS_GOOD;
    if (percent >= 50) return STATUS_WARNING;
    return STATUS_DANGER;
  };

  /**
   * Determines the color for cluster health status
   * @param health - Health status string
   * @returns string - Color code
   */
  const getHealthColor = (health: string): string => {
    if (health === 'green') return STATUS_GOOD;
    if (health === 'yellow') return STATUS_WARNING;
    return STATUS_DANGER;
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

  // Data fetching
  //
  // Each fetcher manages its own loading flag and resolves to `true` on
  // success, `false` on failure (never rejects), so one failing source can't
  // hide another's state and the caller knows what actually succeeded.
  //
  // Failures are toasted once when a source starts failing, not on every
  // auto-refresh while it keeps failing.
  const failingSourcesRef = useRef<Set<string>>(new Set());

  const reportResult = useCallback(
    (source: string, title: string, err?: any): boolean => {
      const failing = failingSourcesRef.current;
      if (err === undefined) {
        failing.delete(source);
        return true;
      }
      if (!failing.has(source)) {
        failing.add(source);
        notifications.toasts.addDanger({
          title,
          text: err?.body?.message || 'An unexpected error occurred',
        });
      }
      return false;
    },
    [notifications]
  );

  const fetchConfig = useCallback(async (): Promise<boolean> => {
    setClusterConfigLoading(true);
    try {
      const res = await http.get(`/api/${PLUGIN_ID}/config`);
      setClusterConfig(res.data);
      return reportResult('config', '');
    } catch (err) {
      return reportResult('config', 'Failed to fetch configuration', err);
    } finally {
      setClusterConfigLoading(false);
    }
  }, [http, reportResult]);

  const fetchCluster = useCallback(async (): Promise<boolean> => {
    setClusterHealthLoading(true);
    try {
      const res = await http.get(`/api/${PLUGIN_ID}/cluster_health`);
      setClusterHealth(res.data);
      return reportResult('cluster health', '');
    } catch (err) {
      return reportResult('cluster health', 'Failed to fetch cluster health', err);
    } finally {
      setClusterHealthLoading(false);
    }
  }, [http, reportResult]);

  const fetchNodes = useCallback(async (): Promise<boolean> => {
    setNodesLoading(true);
    try {
      const nodes = await http.get(`/api/${PLUGIN_ID}/nodes_stats`);
      setNodesData(nodes);
      return reportResult('nodes', '');
    } catch (err) {
      return reportResult('nodes', 'Failed to fetch nodes data', err);
    } finally {
      setNodesLoading(false);
    }
  }, [http, reportResult]);

  const fetchRecovery = useCallback(async (): Promise<boolean> => {
    setRecoveryLoading(true);
    try {
      const recovData = await http.get(`/api/${PLUGIN_ID}/recovery`, {
        query: { include_completed: !hideDone },
      });
      setRecoveryData(recovData);
      return reportResult('recovery', '');
    } catch (err) {
      return reportResult('recovery', 'Failed to fetch recovery data', err);
    } finally {
      setRecoveryLoading(false);
    }
  }, [http, reportResult, hideDone]);

  const fetchClusterStats = useCallback(async (): Promise<boolean> => {
    setClusterStatsLoading(true);
    try {
      const parsedData = await http.get(`/api/${PLUGIN_ID}/cluster_stats`);
      setClusterStats(parsedData);
      return reportResult('cluster stats', '');
    } catch (err) {
      return reportResult('cluster stats', 'Failed to fetch cluster stats', err);
    } finally {
      setClusterStatsLoading(false);
    }
  }, [http, reportResult]);

  const fetchSnapshots = useCallback(async (): Promise<boolean> => {
    setSnapshotsLoading(true);
    try {
      const response = await http.get(`/api/${PLUGIN_ID}/snapshots`);
      setSnapshotsData(Array.isArray(response?.snapshots) ? response.snapshots : []);
      return reportResult('snapshots', '');
    } catch (err) {
      setSnapshotsData([]);
      return reportResult('snapshots', 'Failed to fetch snapshots', err);
    } finally {
      setSnapshotsLoading(false);
    }
  }, [http, reportResult]);

  /**
   * Toggles the display of completed recovery items. Completed recoveries
   * are only requested from OpenSearch while this is off.
   */
  const toggleHideDone = () => setHideDone(!hideDone);

  /**
   * Configured-vs-actual node comparison, computed once per data change.
   * Feeds the Nodes stat and the Graph View "Missing Nodes" card. When the
   * configured hosts can't be matched to any node (load balancer, proxy),
   * the comparison is flagged unreliable and no alarm is raised.
   */
  const inventory = useMemo(
    () => compareInventory(clusterConfig?.hosts ?? [], nodesData),
    [clusterConfig, nodesData]
  );
  const inventoryReady = clusterConfig !== null && nodesData.length > 0;
  const inventoryAlarm =
    inventoryReady &&
    inventory.reliable &&
    (inventory.missingHosts.length > 0 || inventory.unexpectedNodes.length > 0);

  /**
   * Groups the current nodes by their reported version, so that when a
   * cluster is running mixed versions (e.g. mid-upgrade) the UI can show
   * which nodes are on which version rather than just the distinct list
   * of version strings.
   */
  const versionGroups = useMemo(() => {
    const map: Record<string, string[]> = {};
    nodesData.forEach(node => {
      if (!node.version) return;
      if (!map[node.version]) map[node.version] = [];
      map[node.version].push(node.name);
    });

    return Object.keys(map)
      .sort()
      .map(version => ({ version, nodes: map[version].sort() }));
  }, [nodesData]);

  /**
   * Shortest and longest JVM uptime across reporting nodes. The shortest one
   * is the most actionable (it reveals a recent restart), the longest one is
   * what OpenSearch exposes as `max_uptime_in_millis`.
   */
  const uptimeRange = useMemo(() => {
    const withUptime = nodesData.filter(
      (node): node is ClusterNode & { uptime: number } => node.uptime != null
    );
    if (withUptime.length === 0) return null;
    const sorted = [...withUptime].sort((a, b) => a.uptime - b.uptime);
    return {
      shortest: sorted[0],
      longest: sorted[sorted.length - 1],
      count: sorted.length,
    };
  }, [nodesData]);

  /**
   * Refreshes every section. Concurrent calls share the in-flight run, so a
   * manual toggle can't stack a second round of requests on top of a poll.
   * "Last update" only advances when every source succeeded.
   */
  const refreshAll = useCallback(async () => {
    setLastAttemptTime(new Date());
    const sources: [string, () => Promise<boolean>][] = [
      ['cluster health', fetchCluster],
      ['nodes', fetchNodes],
      ['recovery', fetchRecovery],
      ['cluster stats', fetchClusterStats],
      ['config', fetchConfig],
      ['snapshots', fetchSnapshots],
    ];
    const results = await Promise.all(sources.map(([, fetch]) => fetch()));
    const failed = sources.filter((_, i) => !results[i]).map(([name]) => name);
    setFailedSources(failed);
    if (failed.length === 0) setLastSuccessTime(new Date());
  }, [fetchCluster, fetchNodes, fetchRecovery, fetchClusterStats, fetchConfig, fetchSnapshots]);

  // Always call the latest refreshAll through a single-flight wrapper whose
  // identity never changes, so the polling loop isn't restarted (and no
  // extra request is fired) whenever a fetcher's dependencies change.
  const refreshAllRef = useRef(refreshAll);
  refreshAllRef.current = refreshAll;
  const runRefresh = useMemo(() => singleFlight(() => refreshAllRef.current()), []);

  // Initial load
  useEffect(() => {
    void runRefresh();
  }, [runRefresh]);

  // Refetch recoveries when switching between ongoing-only and all.
  const isFirstHideDoneRender = useRef(true);
  useEffect(() => {
    if (isFirstHideDoneRender.current) {
      isFirstHideDoneRender.current = false;
      return;
    }
    void fetchRecovery();
  }, [fetchRecovery]);

  // Auto-refresh: chained timeouts (no overlap), paused while the tab is
  // hidden, resumed with an immediate refresh when it becomes visible.
  useEffect(() => {
    if (!autoRefresh) return undefined;
    return startPolling({
      intervalMs: refreshInterval * 1000,
      run: runRefresh,
      isHidden: () => typeof document !== 'undefined' && document.hidden,
      onVisibilityChange: (listener) => {
        document.addEventListener('visibilitychange', listener);
        return () => document.removeEventListener('visibilitychange', listener);
      },
    });
  }, [autoRefresh, refreshInterval, runRefresh]);

  // Table columns configuration
  const nodesColumns: EuiBasicTableColumn<ClusterNode>[] = [
    { field: 'name', name: 'Node Name', sortable: true },
    {
      field: 'host',
      name: 'Host',
      sortable: true,
      render: (host: string | null) => host ?? '-',
    },
    {
      field: 'version',
      name: 'Version',
      sortable: true,
      render: (version: string | null) => version ?? '-',
    },
    {
      field: 'roles',
      name: 'Roles',
      render: (roles: string[]) => <div style={{ whiteSpace: 'pre-line' }}>{roles.join('\n')}</div>
    },
    {
      field: 'zone',
      name: 'Zone',
      sortable: true,
      render: (zone: string | null) => zone ?? '-',
    },
    {
      field: 'uptime',
      name: 'Uptime',
      sortable: true,
      render: (uptime: number | null) => (uptime != null ? formatDuration(uptime, 'm') : '-'),
    },
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
      name: (
        <EuiToolTip
          content={
            'Raw OS memory in use, including the Linux page cache/buffers the ' +
            'kernel keeps warm for disk I/O. For an actionable per-node memory ' +
            'signal, see JVM Heap.'
          }
        >
          <span>
            Memory <EuiIcon type='iInCircle' size='s' />
          </span>
        </EuiToolTip>
      ),
      render: (mem: { percent: number; used: number; total: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={mem.percent}
            max={100}
            size='s'
            valueText={true}
            label={`${formatBytes(mem.used)} / ${formatBytes(mem.total)}`}
            color={INFO_COLOR}
          />
        </div>
      ),
    },
    {
      field: 'heap',
      name: 'JVM Heap',
      render: (heap: { percent: number; used: number; total: number }) => (
        <div style={{ width: '90%' }}>
          <EuiProgress
            value={heap.percent}
            max={100}
            size='s'
            valueText={true}
            label={`${formatBytes(heap.used)} / ${formatBytes(heap.total)}`}
            color={getUsageColor(heap.percent)}
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
            value={swap.percent}
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
            value={fs.percent}
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
              value={numeric}
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
              value={numeric}
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
              value={numeric}
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
        <span
          style={{
            color:
              state === 'SUCCESS' ? STATUS_GOOD : state === 'FAILED' ? STATUS_DANGER : STATUS_WARNING,
          }}
        >
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
              value={percent}
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
                  id={`${PLUGIN_ID}clusterTitle`}
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
                  title={
                    uptimeRange ? (
                      <div>
                        <span>{formatDuration(uptimeRange.shortest.uptime, 'm')}</span>
                        {uptimeRange.count > 1 && (
                          <div style={{ fontSize: '0.5em', color: SUBDUED_TEXT_COLOR }}>
                            {`longest: ${formatDuration(uptimeRange.longest.uptime, 'm')}`}
                          </div>
                        )}
                      </div>
                    ) : clusterStats?.longest_node_uptime != null ? (
                      <div>
                        <span>{formatDuration(clusterStats.longest_node_uptime, 'm')}</span>
                        <div style={{ fontSize: '0.5em', color: SUBDUED_TEXT_COLOR }}>
                          longest node
                        </div>
                      </div>
                    ) : '--'
                  }
                  description={
                    <EuiToolTip
                      position='bottom'
                      content={
                        uptimeRange
                          ? `Shortest JVM uptime: ${uptimeRange.shortest.name}. ` +
                            `Longest: ${uptimeRange.longest.name}. ` +
                            'A recent value here means a node restarted recently; ' +
                            'there is no single cluster-wide uptime.'
                          : 'JVM uptime of the longest-running node. There is no single cluster-wide uptime.'
                      }
                    >
                      <span>
                        <EuiIcon type='clock' /> Node Uptime <EuiIcon type='iInCircle' size='s' />
                      </span>
                    </EuiToolTip>
                  }
                  textAlign='left'
                  titleElement='div'
                  isLoading={clusterStatsLoading && !uptimeRange}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiStat
                  title={
                    clusterStats ? (
                      clusterStats.version == null ? '--' : Array.isArray(clusterStats.version) ? (
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
                        versionGroups.length > 0 ? (
                          <EuiToolTip
                            position='bottom'
                            content={
                              <div>
                                {versionGroups.map(group => (
                                  <div key={group.version}>
                                    <strong>{group.version}</strong>
                                    <ul>
                                      {group.nodes.map(name => (
                                        <li key={name}>{name}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ))}
                              </div>
                            }
                          >
                            <span
                              style={{
                                fontSize: '0.8em',
                                marginLeft: '5px',
                                textDecoration: 'underline dotted',
                                cursor: 'help',
                              }}
                            >
                              ({clusterStats.version.length} versions)
                            </span>
                          </EuiToolTip>
                        ) : (
                          <span style={{ fontSize: '0.8em', marginLeft: '5px' }}>
                            ({clusterStats.version.length} versions)
                          </span>
                        )
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
                  titleColor={snapshotsData.length === 0 ? STATUS_GOOD : STATUS_WARNING}
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
                    id={`${PLUGIN_ID}nodesTitle`}
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
                          color:
                            clusterStats && inventoryReady && inventory.reliable
                              ? inventoryAlarm
                                ? STATUS_DANGER
                                : STATUS_GOOD
                              : SUBDUED_TEXT_COLOR,
                        }}
                      >
                        {clusterStats ? clusterStats.nodes.total : '--'}
                      </span>
                      {inventoryReady && inventory.reliable && (
                        <span style={{ fontSize: '0.5em', color: SUBDUED_TEXT_COLOR }}>
                          {' '}
                          / {inventory.expectedCount}
                        </span>
                      )}
                    </div>
                  }
                  description={
                    <span>
                      <EuiIcon type='node' /> Active
                      {clusterStats && inventoryAlarm && (
                        <EuiToolTip
                          position='bottom'
                          content={
                            <div>
                              {inventory.missingHosts.length > 0 && (
                                <div>
                                  <strong>Configured hosts not reporting:</strong>
                                  <ul>
                                    {inventory.missingHosts.map(host => (
                                      <li key={host}>{host}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {inventory.unexpectedNodes.length > 0 && (
                                <div>
                                  <strong>Nodes not listed in opensearch.hosts:</strong>
                                  <ul>
                                    {inventory.unexpectedNodes.map(node => (
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
                      {inventoryReady && inventory.reason === 'no_match' && (
                        <EuiToolTip
                          position='bottom'
                          content={
                            'None of the hosts in opensearch.hosts (' +
                            (clusterConfig?.hosts ?? []).map(h => h.host).join(', ') +
                            ') matches a cluster node by name, host name or address. ' +
                            'They are probably a load balancer or proxy, so missing-node ' +
                            'detection is disabled. List the nodes themselves in ' +
                            'opensearch.hosts to enable it.'
                          }
                        >
                          <EuiIcon type='iInCircle' style={{ marginLeft: '5px' }} />
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
                        <div style={{ fontSize: '0.5em', color: SUBDUED_TEXT_COLOR }}>
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
                        <div style={{ fontSize: '0.5em', color: SUBDUED_TEXT_COLOR }}>
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
                    id={`${PLUGIN_ID}shardsTitle`}
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
                  
                  titleColor={clusterHealth?.unassigned_shards > 0 ? STATUS_DANGER : STATUS_GOOD}
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
                  
                  titleColor={clusterHealth?.initializing_shards > 0 ? STATUS_DANGER : STATUS_GOOD}
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
                  
                  titleColor={clusterHealth?.active_shards_percent_as_number < 100 ? STATUS_DANGER : STATUS_GOOD}
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
                    id={`${PLUGIN_ID}indicesTitle`}
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
                  id={`${PLUGIN_ID}graphViewTitle`}
                  defaultMessage='Graph View'
                />
              </h2>
            </EuiTitle>
          </EuiPageContentHeader>

          <EuiPageContentBody>
            {nodesData.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <NetworkGraph
                  nodes={nodesData}
                  missingNodes={inventory.reliable ? inventory.missingHosts : []}
                />
              </div>
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
                          id={`${PLUGIN_ID}pluginTitle`}
                          defaultMessage='{name}'
                          values={{ name: PLUGIN_NAME }}
                        />
                      </h1>
                    </EuiTitle>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFlexGroup alignItems="center" gutterSize="s">
                      {lastSuccessTime && (
                        <EuiFlexItem grow={false}>
                          <EuiText color="subdued" size="s">
                            Last update: {lastSuccessTime.toLocaleTimeString()}
                          </EuiText>
                        </EuiFlexItem>
                      )}
                      {failedSources.length > 0 && lastAttemptTime && (
                        <EuiFlexItem grow={false}>
                          <EuiToolTip
                            position="bottom"
                            content={
                              `Refresh at ${lastAttemptTime.toLocaleTimeString()} could not load: ` +
                              `${failedSources.join(', ')}. Other sections show their latest successful data.`
                            }
                          >
                            <EuiIcon type="alert" color="warning" aria-label="Some data failed to refresh" />
                          </EuiToolTip>
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
                            value={intervalInput}
                            onChange={handleIntervalChange}
                            min={MIN_REFRESH_INTERVAL_SECONDS}
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
                            {`Enter a number of at least ${MIN_REFRESH_INTERVAL_SECONDS} seconds; ` +
                              `still refreshing every ${refreshInterval}s`}
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
                        id={`${PLUGIN_ID}clusterNodesTitle`}
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
                    loading={nodesLoading}
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
                        id={`${PLUGIN_ID}snapshotsTitle`}
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
                        id={`${PLUGIN_ID}shardsRecoveryTitle`}
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
                    loading={recoveryLoading}
                    pagination={true}
                    sorting={{
                      sort: {
                        field: 'index',
                        direction: 'asc',
                      },
                    }}
                    search={{
                      box: {
                        incremental: true,
                        placeholder: hideDone
                          ? 'Search ongoing recoveries'
                          : 'Search ongoing and completed recoveries',
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
