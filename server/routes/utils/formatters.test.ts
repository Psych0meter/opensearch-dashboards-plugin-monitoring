import { formatNodeStats } from './formatNodeStats';
import { formatClusterStats } from './formatClusterStats';
import { formatRecoveryStats } from './formatRecoveryStats';
import { calculatePercentage } from './common';

describe('calculatePercentage', () => {
  it('rounds to two decimals and guards against zero or invalid totals', () => {
    expect(calculatePercentage(1, 3)).toBe(33.33);
    expect(calculatePercentage(5, 0)).toBe(0);
    expect(calculatePercentage(NaN, 10)).toBe(0);
  });
});

describe('formatNodeStats', () => {
  const fullNode = {
    name: 'os-data-01',
    host: '10.0.0.1',
    ip: '10.0.0.1',
    transport_address: '10.0.0.1:9300',
    roles: ['data', 'ingest'],
    attributes: { zone: 'eu-1a' },
    os: {
      cpu: { percent: 12 },
      mem: { used_in_bytes: 50, total_in_bytes: 100 },
      swap: { used_in_bytes: 0, total_in_bytes: 0 },
    },
    fs: { total: { total_in_bytes: 200, free_in_bytes: 150 } },
    jvm: { uptime_in_millis: 60000, mem: { heap_used_in_bytes: 30, heap_max_in_bytes: 120 } },
  };

  it('formats a complete node and merges version and HTTP address from node info', () => {
    const [result] = formatNodeStats(
      { abc: fullNode },
      { abc: { version: '3.9.0', http: { publish_address: 'os-data-01/10.0.0.1:9200' } } }
    );
    expect(result).toEqual({
      id: 'abc',
      name: 'os-data-01',
      host: '10.0.0.1',
      ip: '10.0.0.1',
      transport_address: '10.0.0.1:9300',
      http_address: 'os-data-01/10.0.0.1:9200',
      version: '3.9.0',
      roles: ['data', 'ingest'],
      zone: 'eu-1a',
      uptime: 60000,
      cpu: { percent: 12 },
      mem: { total: 100, used: 50, percent: 50 },
      heap: { total: 120, used: 30, percent: 25 },
      swap: { total: 0, used: 0, percent: 0 },
      fs: { total: 200, used: 50, percent: 25 },
    });
  });

  it('keeps a node with missing stats sections instead of throwing', () => {
    const [result] = formatNodeStats({ xyz: { name: 'starting-node' } }, {});
    expect(result.name).toBe('starting-node');
    expect(result.roles).toEqual([]);
    expect(result.zone).toBeNull();
    expect(result.uptime).toBeNull();
    expect(result.version).toBeNull();
    expect(result.cpu.percent).toBe(0);
    expect(result.mem).toEqual({ total: 0, used: 0, percent: 0 });
    expect(result.fs).toEqual({ total: 0, used: 0, percent: 0 });
  });

  it('falls back to the node id when no name is reported, and tolerates empty input', () => {
    expect(formatNodeStats({ id1: {} })[0].name).toBe('id1');
    expect(formatNodeStats(undefined)).toEqual([]);
  });
});

describe('formatClusterStats', () => {
  it('tolerates an empty response', () => {
    const result = formatClusterStats({});
    expect(result.longest_node_uptime).toBeNull();
    expect(result.version).toBeNull();
    expect(result.nodes.total).toBe(0);
    expect(result.jvm.mem).toEqual({ total: 0, used: 0, percent: 0 });
    expect(result.indices.shards.total).toBe(0);
  });

  it('collapses homogeneous versions and keeps mixed ones sorted', () => {
    expect(formatClusterStats({ nodes: { versions: ['3.9.0', '3.9.0'] } }).version).toBe('3.9.0');
    expect(formatClusterStats({ nodes: { versions: ['3.9.0', '3.8.0'] } }).version).toEqual([
      '3.8.0',
      '3.9.0',
    ]);
  });

  it('exposes the maximum JVM uptime as the longest node uptime', () => {
    const result = formatClusterStats({
      nodes: {
        jvm: { max_uptime_in_millis: 5000 },
        fs: { total_in_bytes: 100, free_in_bytes: 40 },
        count: { total: 3, data: 2 },
      },
    });
    expect(result.longest_node_uptime).toBe(5000);
    expect(result.fs).toEqual({ total: 100, used: 60, percent: 60 });
    expect(result.nodes.total).toBe(3);
    expect(result.nodes.data).toBe(2);
    expect(result.nodes.warm).toBe(0);
  });
});

describe('formatRecoveryStats', () => {
  it('returns an empty list for empty or missing results', () => {
    expect(formatRecoveryStats({})).toEqual([]);
    expect(formatRecoveryStats(undefined)).toEqual([]);
    expect(formatRecoveryStats({ idx: {} })).toEqual([]);
  });

  it('formats an ongoing recovery', () => {
    const [row] = formatRecoveryStats({
      logs: {
        shards: [
          {
            id: 2,
            type: 'PEER',
            stage: 'INDEX',
            total_time_in_millis: 1500,
            source: { host: '10.0.0.1', name: 'os-data-01' },
            target: { host: '10.0.0.2', name: 'os-data-02' },
            index: {
              size: { total_in_bytes: 1000, recovered_in_bytes: 250, percent: '25.0%' },
              files: { total: 10, recovered: 3, percent: '30.0%' },
            },
            translog: { total: 0, recovered: 0, percent: '100.0%' },
          },
        ],
      },
    });
    expect(row).toMatchObject({
      index: 'logs',
      shard: 2,
      stage: 'INDEX',
      source_node: 'os-data-01',
      target_node: 'os-data-02',
      files_percent: '30.0%',
      files_recovered: 3,
      files_total: 10,
      bytes_percent: '25.0%',
      bytes_recovered: 250,
      bytes_total: 1000,
      // nothing to replay: shown as "-" rather than a misleading percentage
      translog_percent: '-',
    });
  });

  it('formats a completed existing-store recovery with no source node', () => {
    const [row] = formatRecoveryStats({
      logs: { shards: [{ id: 0, type: 'EXISTING_STORE', stage: 'DONE', target: { name: 'n1' } }] },
    });
    expect(row.stage).toBe('DONE');
    expect(row.source_node).toBe('-');
    expect(row.files_percent).toBe('-');
    expect(row.bytes_percent).toBe('-');
  });
});
