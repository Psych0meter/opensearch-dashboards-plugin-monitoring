import { calculatePercentage } from './common';

/**
 * Formats per-node stats (from /_nodes/stats) and enriches each node with
 * its version, sourced separately from the Nodes Info API since /_nodes/stats
 * does not expose a node's version.
 *
 * @param nodesObj - The `nodes` object from the /_nodes/stats response.
 * @param nodesInfoObj - The `nodes` object from the /_nodes info response,
 *   keyed by node id, used only to look up each node's version.
 */
export function formatNodeStats(nodesObj: any, nodesInfoObj: any = {}): any[] {
  return Object.entries(nodesObj).map(([id, node]: any) => {
    const usedMem = node.os.mem.used_in_bytes;
    const totalMem = node.os.mem.total_in_bytes;

    const usedSwap = node.os.swap.used_in_bytes;
    const totalSwap = node.os.swap.total_in_bytes;

    const totalFs = node.fs.total.total_in_bytes;
    const freeFs = node.fs.total.free_in_bytes;
    const usedFs = totalFs - freeFs;

    return {
      id,
      name: node.name,
      host: node.host,
      version: nodesInfoObj?.[id]?.version ?? null,
      roles: node.roles,
      zone: node.attributes?.zone ?? null,
      cpu: { percent: node.os.cpu.percent },
      mem: {
        total: totalMem,
        used: usedMem,
        percent: calculatePercentage(usedMem, totalMem),
      },
      swap: {
        total: totalSwap,
        used: usedSwap,
        percent: calculatePercentage(usedSwap, totalSwap),
      },
      fs: {
        total: totalFs,
        used: usedFs,
        percent: calculatePercentage(usedFs, totalFs),
      },
    };
  });
}
