import {
  compareInventory,
  ExpectedHost,
  getNodeIdentifiers,
  NodeIdentity,
  normalizeHost,
  parsePublishAddress,
} from './node_inventory';

const node = (name: string, extra: Partial<NodeIdentity> = {}): NodeIdentity => ({
  name,
  host: null,
  ip: null,
  transport_address: null,
  http_address: null,
  ...extra,
});

const host = (name: string, addresses: string[] = []): ExpectedHost => ({ host: name, addresses });

describe('normalizeHost', () => {
  it('lower-cases, strips IPv6 brackets and the trailing root dot', () => {
    expect(normalizeHost(' Node1.Example.COM. ')).toBe('node1.example.com');
    expect(normalizeHost('[2001:db8::1]')).toBe('2001:db8::1');
  });
});

describe('parsePublishAddress', () => {
  it('handles the address formats OpenSearch reports', () => {
    expect(parsePublishAddress('10.0.0.1:9300')).toEqual(['10.0.0.1']);
    expect(parsePublishAddress('node1.example.com/10.0.0.1:9200')).toEqual([
      'node1.example.com',
      '10.0.0.1',
    ]);
    expect(parsePublishAddress('[2001:db8::1]:9300')).toEqual(['2001:db8::1']);
    expect(parsePublishAddress('inet[/10.0.0.2:9300]')).toEqual(['10.0.0.2']);
  });
});

describe('getNodeIdentifiers', () => {
  it('collects names, addresses and short host names', () => {
    const ids = getNodeIdentifiers(
      node('os-data-01', {
        host: 'os-data-01.prod.example.com',
        ip: '10.0.0.1',
        transport_address: '10.0.0.1:9300',
        http_address: 'os-data-01.prod.example.com/10.0.0.1:9200',
      })
    );
    expect(Array.from(ids).sort()).toEqual([
      '10.0.0.1',
      'os-data-01',
      'os-data-01.prod.example.com',
    ]);
  });

  it('does not derive a short name from an IP address', () => {
    expect(getNodeIdentifiers(node('n', { ip: '10.0.0.1' })).has('10')).toBe(false);
  });
});

describe('compareInventory', () => {
  const cluster = [
    node('os-data-01', { ip: '10.0.0.1', host: '10.0.0.1' }),
    node('os-data-02', { ip: '10.0.0.2', host: '10.0.0.2' }),
    node('os-manager-01', { ip: '10.0.0.3', host: '10.0.0.3' }),
  ];

  it('matches FQDNs against short node names', () => {
    const result = compareInventory(
      [host('os-data-01.example.com'), host('os-data-02.example.com'), host('os-manager-01.example.com')],
      cluster
    );
    expect(result).toEqual({
      reliable: true,
      reason: null,
      missingHosts: [],
      unexpectedNodes: [],
      expectedCount: 3,
    });
  });

  it('matches hosts through their resolved addresses when names differ', () => {
    const result = compareInventory(
      [
        host('search-a.example.com', ['10.0.0.1']),
        host('search-b.example.com', ['10.0.0.2']),
        host('search-c.example.com', ['10.0.0.3']),
      ],
      cluster
    );
    expect(result.missingHosts).toEqual([]);
    expect(result.unexpectedNodes).toEqual([]);
    expect(result.expectedCount).toBe(3);
  });

  it('matches IP literals against node addresses', () => {
    const result = compareInventory([host('10.0.0.1'), host('10.0.0.2'), host('10.0.0.3')], cluster);
    expect(result.reliable).toBe(true);
    expect(result.missingHosts).toEqual([]);
  });

  it('matches IPv6 hosts against bracketed publish addresses', () => {
    const result = compareInventory(
      [host('[2001:db8::1]')],
      [node('v6-node', { transport_address: '[2001:db8::1]:9300' })]
    );
    expect(result.missingHosts).toEqual([]);
    expect(result.unexpectedNodes).toEqual([]);
  });

  it('reports configured hosts that are not reporting and nodes that are not configured', () => {
    const result = compareInventory(
      [host('os-data-01.example.com'), host('os-data-02.example.com'), host('os-data-09.example.com')],
      cluster
    );
    expect(result.reliable).toBe(true);
    expect(result.missingHosts).toEqual(['os-data-09.example.com']);
    expect(result.unexpectedNodes).toEqual(['os-manager-01']);
    expect(result.expectedCount).toBe(3);
  });

  it('treats an inventory that matches no node as a load balancer, without alarms', () => {
    const result = compareInventory([host('search.example.com', ['192.0.2.10'])], cluster);
    expect(result).toEqual({
      reliable: false,
      reason: 'no_match',
      missingHosts: [],
      unexpectedNodes: [],
      expectedCount: 0,
    });
  });

  it('is unreliable when no host is configured', () => {
    expect(compareInventory([], cluster).reason).toBe('no_hosts');
  });

  it('reports every configured host as missing when no node reports at all', () => {
    const result = compareInventory([host('a.example.com'), host('b.example.com')], []);
    expect(result.reliable).toBe(true);
    expect(result.missingHosts).toEqual(['a.example.com', 'b.example.com']);
    expect(result.expectedCount).toBe(2);
  });

  it('counts every node behind a round-robin name as expected', () => {
    const result = compareInventory(
      [host('opensearch.example.com', ['10.0.0.1', '10.0.0.2', '10.0.0.3'])],
      cluster
    );
    expect(result.reliable).toBe(true);
    expect(result.unexpectedNodes).toEqual([]);
    expect(result.expectedCount).toBe(3);
  });

  it('does not count a duplicated configured host twice', () => {
    const result = compareInventory([host('gone.example.com'), host('gone.example.com'), host('10.0.0.1')], cluster);
    expect(result.missingHosts).toEqual(['gone.example.com']);
    expect(result.expectedCount).toBe(2);
  });
});
