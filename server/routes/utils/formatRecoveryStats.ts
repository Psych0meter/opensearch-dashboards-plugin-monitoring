import { RecoveryStats } from '../../../common/types';
import { toNumber } from './common';
import { RawRecoveryResponse } from './raw_types';

/**
 * Progress as a "NN.N%" string, or '-' when there is nothing meaningful to
 * show: an unknown or zero total (nothing to copy or replay) would otherwise
 * render as -1% or a misleading 0%/100%.
 *
 * OpenSearch's own percentage is preferred because it excludes reused files
 * from the calculation, which a plain recovered/total ratio would not. The
 * ratio is only a fallback when the upstream value is missing or unusable
 * (e.g. the "-1.0%" it reports for an unknown total).
 */
function percentOrDash(recovered: number, total: number, upstream: unknown): string {
  if (total <= 0) return '-';
  const parsed = typeof upstream === 'string' ? parseFloat(upstream) : NaN;
  const percent = Number.isFinite(parsed) && parsed >= 0 ? parsed : (recovered / total) * 100;
  return `${Math.min(100, Math.max(0, percent)).toFixed(1)}%`;
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
      const filesRecovered = toNumber(indexFiles?.recovered);
      const bytesTotal = toNumber(indexSize?.total_in_bytes);
      const bytesRecovered = toNumber(indexSize?.recovered_in_bytes);
      const translogTotal = toNumber(transLog?.total);
      const translogRecovered = toNumber(transLog?.recovered);

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
        files_recovered: filesRecovered,
        files_percent: percentOrDash(filesRecovered, filesTotal, indexFiles?.percent),
        files_total: filesTotal,
        bytes: bytesRecovered,
        bytes_recovered: bytesRecovered,
        bytes_percent: percentOrDash(bytesRecovered, bytesTotal, indexSize?.percent),
        bytes_total: bytesTotal,
        translog_recovered: translogRecovered,
        translog_percent: percentOrDash(translogRecovered, translogTotal, transLog?.percent),
        translog_total: translogTotal,
      });
    });
  }

  return parsedData;
}
