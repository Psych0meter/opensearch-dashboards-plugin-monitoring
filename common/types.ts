/**
 * Response shapes shared by the server routes and the browser app.
 *
 * Every numeric field is guaranteed to be a finite number (missing upstream
 * metrics are normalized to 0), and every optional upstream value that has no
 * sensible numeric default is exposed as `null`.
 */

export interface UsageStat {
  total: number;
  used: number;
  percent: number;
}

export interface NodeStats {
  id: string;
  name: string;
  host: string | null;
  ip: string | null;
  /** Transport publish address, e.g. `10.0.0.1:9300`. */
  transport_address: string | null;
  /** HTTP publish address, e.g. `node1.example.com/10.0.0.1:9200`. */
  http_address: string | null;
  version: string | null;
  roles: string[];
  zone: string | null;
  /** JVM uptime in milliseconds, or null when not reported. */
  uptime: number | null;
  cpu: { percent: number };
  mem: UsageStat;
  heap: UsageStat;
  swap: UsageStat;
  fs: UsageStat;
}

export interface RecoveryStats {
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

export interface ClusterStatsSummary {
  cluster_name: string | null;
  status: string | null;
  /**
   * A single version string, or an array of distinct version strings when
   * the cluster is running mixed versions (e.g. mid-upgrade).
   */
  version: string | string[] | null;
  uptime: number | null;
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
    mem: UsageStat;
    threads: number;
  };
  fs: UsageStat;
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
