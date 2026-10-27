import { ClusterStatsSummary } from '../../../common/types';
import {
  toNullableNumber,
  toNullableString,
  toNumber,
  toUsage,
  toUsageFromFree,
} from './common';
import { RawClusterStats } from './raw_types';

/**
 * Collapses the `nodes.versions` array into a single string when the cluster
 * is homogeneous, keeps the array when versions are mixed.
 */
function formatVersions(versions: unknown): string | string[] | null {
  if (!Array.isArray(versions)) return null;
  const distinct = Array.from(new Set(versions.filter((v) => typeof v === 'string')));
  if (distinct.length === 0) return null;
  return distinct.length === 1 ? distinct[0] : distinct.sort();
}

export function formatClusterStats(rawData: RawClusterStats | null | undefined): ClusterStatsSummary {
  const nodes = rawData?.nodes;
  const count = nodes?.count ?? {};
  const indices = rawData?.indices;

  return {
    cluster_name: toNullableString(rawData?.cluster_name),
    status: toNullableString(rawData?.status),
    version: formatVersions(nodes?.versions),
    longest_node_uptime: toNullableNumber(nodes?.jvm?.max_uptime_in_millis),

    nodes: {
      total: toNumber(count.total),
      cluster_manager: toNumber(count.cluster_manager),
      coordinating_only: toNumber(count.coordinating_only),
      data: toNumber(count.data),
      ingest: toNumber(count.ingest),
      master: toNumber(count.master),
      remote_cluster_client: toNumber(count.remote_cluster_client),
      search: toNumber(count.search),
      warm: toNumber(count.warm),
    },

    jvm: {
      mem: toUsage(nodes?.jvm?.mem?.heap_used_in_bytes, nodes?.jvm?.mem?.heap_max_in_bytes),
      threads: toNumber(nodes?.jvm?.threads),
    },

    fs: toUsageFromFree(nodes?.fs?.total_in_bytes, nodes?.fs?.free_in_bytes),

    indices: {
      count: toNumber(indices?.count),
      shards: {
        total: toNumber(indices?.shards?.total),
        primaries: toNumber(indices?.shards?.primaries),
        replication: toNumber(indices?.shards?.replication),
      },
      docs: {
        count: toNumber(indices?.docs?.count),
        deleted: toNumber(indices?.docs?.deleted),
      },
      store: {
        size_in_bytes: toNumber(indices?.store?.size_in_bytes),
      },
      segments: {
        count: toNumber(indices?.segments?.count),
      },
    },
  };
}
