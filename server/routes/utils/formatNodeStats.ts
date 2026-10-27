import { NodeStats } from '../../../common/types';
import {
  toNullableNumber,
  toNullableString,
  toNumber,
  toUsage,
  toUsageFromFree,
} from './common';
import { RawNodeInfo, RawNodeStats } from './raw_types';

/**
 * Formats per-node stats (from /_nodes/stats) and enriches each node with
 * fields only exposed by the Nodes Info API (version, HTTP publish address).
 *
 * Missing sections are tolerated: a node that reports no `os`, `fs` or `jvm`
 * block is still listed, with zeroed usage values, instead of failing the
 * whole response.
 *
 * @param nodesObj - The `nodes` object from the /_nodes/stats response.
 * @param nodesInfoObj - The `nodes` object from the /_nodes info response,
 *   keyed by node id.
 */
export function formatNodeStats(
  nodesObj: Record<string, RawNodeStats> | null | undefined,
  nodesInfoObj: Record<string, RawNodeInfo> | null | undefined = {}
): NodeStats[] {
  return Object.entries(nodesObj ?? {}).map(([id, node]) => {
    const info = nodesInfoObj?.[id] ?? {};

    return {
      id,
      name: toNullableString(node?.name) ?? toNullableString(info.name) ?? id,
      host: toNullableString(node?.host) ?? toNullableString(info.host),
      ip: toNullableString(node?.ip) ?? toNullableString(info.ip),
      transport_address:
        toNullableString(node?.transport_address) ?? toNullableString(info.transport_address),
      http_address: toNullableString(info.http?.publish_address),
      version: toNullableString(info.version),
      roles: Array.isArray(node?.roles) ? node.roles : [],
      zone: toNullableString(node?.attributes?.zone),
      uptime: toNullableNumber(node?.jvm?.uptime_in_millis),
      cpu: { percent: toNumber(node?.os?.cpu?.percent) },
      mem: toUsage(node?.os?.mem?.used_in_bytes, node?.os?.mem?.total_in_bytes),
      heap: toUsage(node?.jvm?.mem?.heap_used_in_bytes, node?.jvm?.mem?.heap_max_in_bytes),
      swap: toUsage(node?.os?.swap?.used_in_bytes, node?.os?.swap?.total_in_bytes),
      fs: toUsageFromFree(node?.fs?.total?.total_in_bytes, node?.fs?.total?.free_in_bytes),
    };
  });
}
