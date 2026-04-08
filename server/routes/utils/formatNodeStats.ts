import { calculatePercentage } from './common';

export function formatNodeStats(nodesObj: any): any[] {
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
