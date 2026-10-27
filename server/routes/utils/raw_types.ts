/**
 * Partial shapes of the raw OpenSearch API responses consumed by the
 * formatters. Every field is optional on purpose: a node can omit a section
 * (e.g. while starting up, or when a stats group is unavailable on a given
 * platform), and the formatters must degrade gracefully instead of throwing.
 */

export interface RawUsage {
  total_in_bytes?: number;
  used_in_bytes?: number;
  free_in_bytes?: number;
}

export interface RawNodeStats {
  name?: string;
  host?: string;
  ip?: string;
  transport_address?: string;
  roles?: string[];
  attributes?: Record<string, string>;
  os?: {
    cpu?: { percent?: number };
    mem?: RawUsage;
    swap?: RawUsage;
  };
  fs?: {
    total?: RawUsage;
  };
  jvm?: {
    uptime_in_millis?: number;
    mem?: {
      heap_used_in_bytes?: number;
      heap_max_in_bytes?: number;
    };
  };
}

export interface RawNodeInfo {
  name?: string;
  version?: string;
  host?: string;
  ip?: string;
  transport_address?: string;
  http?: {
    publish_address?: string;
  };
}

export interface RawClusterStats {
  cluster_name?: string;
  status?: string;
  nodes?: {
    count?: Record<string, number>;
    versions?: string[];
    jvm?: {
      max_uptime_in_millis?: number;
      threads?: number;
      mem?: {
        heap_used_in_bytes?: number;
        heap_max_in_bytes?: number;
      };
    };
    fs?: {
      total_in_bytes?: number;
      free_in_bytes?: number;
    };
  };
  indices?: {
    count?: number;
    shards?: {
      total?: number;
      primaries?: number;
      replication?: number;
    };
    docs?: {
      count?: number;
      deleted?: number;
    };
    store?: {
      size_in_bytes?: number;
    };
    segments?: {
      count?: number;
    };
  };
}

export interface RawRecoveryProgress {
  total?: number;
  recovered?: number;
  percent?: string;
  total_in_bytes?: number;
  recovered_in_bytes?: number;
}

export interface RawRecoveryShard {
  id?: number;
  type?: string;
  stage?: string;
  total_time_in_millis?: number;
  source?: { host?: string; name?: string };
  target?: { host?: string; name?: string };
  index?: {
    size?: RawRecoveryProgress;
    files?: RawRecoveryProgress;
  };
  translog?: RawRecoveryProgress;
}

export type RawRecoveryResponse = Record<string, { shards?: RawRecoveryShard[] }>;
