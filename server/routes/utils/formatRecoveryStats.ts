import { RecoveryStats } from '../../../common/types';
import { toNumber } from './common';
import { RawRecoveryProgress, RawRecoveryResponse } from './raw_types';

/**
 * Returns the upstream percentage string, or '-' when there is nothing to
 * recover (a zero total would otherwise render as a misleading 0%).
 */
function percentOrDash(total: number, progress: RawRecoveryProgress | undefined): string {
  if (total === 0) return '-';
  return typeof progress?.percent === 'string' ? progress.percent : '0%';
}

export function formatRecoveryStats(rawData: RawRecoveryResponse | null | undefined): RecoveryStats[] {
  const parsedData: RecoveryStats[] = [];

  for (const [indexName, indexData] of Object.entries(rawData ?? {})) {
    const shards = Array.isArray(indexData?.shards) ? indexData.shards : [];

    shards.forEach((shard) => {
      const source = shard.source ?? {};
      const target = shard.target ?? {};
      const indexSize = shard.index?.size;
      const indexFiles = shard.index?.files;
      const transLog = shard.translog;

      const filesTotal = toNumber(indexFiles?.total);
      const bytesTotal = toNumber(indexSize?.total_in_bytes);
      const translogTotal = toNumber(transLog?.total);

      parsedData.push({
        index: indexName,
        shard: toNumber(shard.id),
        time: toNumber(shard.total_time_in_millis),
        type: shard.type ?? '-',
        stage: shard.stage ?? '-',
        source_host: source.host ?? '-',
        source_node: source.name ?? '-',
        target_host: target.host ?? '-',
        target_node: target.name ?? '-',
        files: filesTotal,
        files_recovered: toNumber(indexFiles?.recovered),
        files_percent: percentOrDash(filesTotal, indexFiles),
        files_total: filesTotal,
        bytes: toNumber(indexSize?.recovered_in_bytes),
        bytes_recovered: toNumber(indexSize?.recovered_in_bytes),
        bytes_percent: percentOrDash(bytesTotal, indexSize),
        bytes_total: bytesTotal,
        translog_recovered: toNumber(transLog?.recovered),
        translog_percent: percentOrDash(translogTotal, transLog),
        translog_total: translogTotal,
      });
    });
  }

  return parsedData;
}
