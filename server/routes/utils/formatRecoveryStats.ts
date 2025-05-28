export function formatRecoveryStats(rawData: any): any[] {
  const parsedData: any[] = [];

  for (const [indexName, indexData] of Object.entries(rawData)) {
    const shards = (indexData as any).shards ?? [];

    shards.forEach((shard: any) => {
      const source = shard.source || {};
      const target = shard.target || {};
      const indexStats = shard.index || {};
      const indexSize = indexStats.size || {};
      const indexFiles = indexStats.files || {};
      const transLog = shard.translog || {};

      parsedData.push({
        index: indexName,
        shard: shard.id,
        time: shard.total_time_in_millis,
        type: shard.type,
        stage: shard.stage,
        source_host: source.host ?? '-',
        source_node: source.name ?? '-',
        target_host: target.host ?? '-',
        target_node: target.name ?? '-',
        files: indexFiles.total ?? 0,
        files_recovered: indexFiles.recovered ?? 0,
        files_percent:
          (indexFiles.total ?? 0) === 0 ? '-' : indexFiles.percent ?? '0%',
        files_total: indexFiles.total ?? 0,
        bytes: indexSize.recovered_in_bytes ?? 0,
        bytes_recovered: indexSize.recovered_in_bytes ?? 0,
        bytes_percent:
          (indexSize.total_in_bytes ?? 0) === 0 ? '-' : indexSize.percent ?? '0%',
        bytes_total: indexSize.total_in_bytes ?? 0,
        translog_recovered: transLog.recovered ?? 0,
        translog_percent:
          (transLog.total ?? 0) === 0 ? '-' : transLog.percent ?? '0%',
        translog_total: transLog.total ?? 0,
      });
    });
  }

  return parsedData;
}
