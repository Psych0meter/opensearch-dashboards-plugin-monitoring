export function getPercentage(used: number, total: number): number {
  if (!total) return 0;
  return (used / total) * 100;
}

export function formatClusterStats(rawData: any) {
  return {
    cluster_name: rawData.cluster_name,
    status: rawData.status,
    version: rawData.nodes.versions,
    uptime: rawData.nodes.jvm.max_uptime_in_millis,

    nodes: {
      total: rawData?.nodes?.count?.total ?? 0,
      cluster_manager: rawData?.nodes?.count?.cluster_manager ?? 0,
      coordinating_only: rawData?.nodes?.count?.coordinating_only ?? 0,
      data: rawData?.nodes?.count?.data ?? 0,
      ingest: rawData?.nodes?.count?.ingest ?? 0,
      master: rawData?.nodes?.count?.master ?? 0,
      remote_cluster_client: rawData?.nodes?.count?.remote_cluster_client ?? 0,
      search: rawData?.nodes?.count?.search ?? 0,
      warm: rawData?.nodes?.count?.warm ?? 0,
    },

    jvm: {
      mem: {
        used: rawData.nodes.jvm.mem.heap_used_in_bytes,
        total: rawData.nodes.jvm.mem.heap_max_in_bytes,
        percent: getPercentage(
          rawData.nodes.jvm.mem.heap_used_in_bytes,
          rawData.nodes.jvm.mem.heap_max_in_bytes
        ),
      },
      threads: rawData.nodes.jvm.threads,
    },

    fs: {
      used:
        rawData.nodes.fs.total_in_bytes - rawData.nodes.fs.free_in_bytes,
      total: rawData.nodes.fs.total_in_bytes,
      percent: getPercentage(
        rawData.nodes.fs.total_in_bytes - rawData.nodes.fs.free_in_bytes,
        rawData.nodes.fs.total_in_bytes
      ),
    },

    indices: {
      count: rawData.indices.count,
      shards: {
        total: rawData.indices.shards.total,
        primaries: rawData.indices.shards.primaries,
        replication: rawData.indices.shards.replication,
      },
      docs: {
        count: rawData.indices.docs.count,
        deleted: rawData.indices.docs.deleted,
      },
      store: {
        size_in_bytes: rawData.indices.store.size_in_bytes,
      },
      segments: {
        count: rawData.indices.segments.count,
      },
    },
  };
}
