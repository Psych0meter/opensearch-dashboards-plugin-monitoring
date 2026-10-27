import { getConfiguredHosts, HostResolver } from './inventory';

describe('getConfiguredHosts', () => {
  it('returns distinct normalized host names from the connection pool', () => {
    const transport = {
      connectionPool: {
        connections: [
          { url: new URL('https://Node1.example.com:9200') },
          { url: new URL('https://node1.example.com:9201') },
          { url: new URL('https://[2001:db8::1]:9200') },
          {},
        ],
      },
    };
    expect(getConfiguredHosts(transport)).toEqual(['2001:db8::1', 'node1.example.com']);
  });

  it('tolerates a transport without a connection pool', () => {
    expect(getConfiguredHosts(undefined)).toEqual([]);
    expect(getConfiguredHosts({})).toEqual([]);
  });
});

describe('HostResolver', () => {
  it('does not look up IP literals', async () => {
    const lookup = jest.fn();
    const resolver = new HostResolver(lookup);
    expect(await resolver.resolve('10.0.0.1')).toEqual(['10.0.0.1']);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('caches lookups until the TTL expires', async () => {
    let now = 0;
    const lookup = jest.fn().mockResolvedValue(['10.0.0.1', '10.0.0.1']);
    const resolver = new HostResolver(lookup, () => now);

    expect(await resolver.resolve('node1.example.com')).toEqual(['10.0.0.1']);
    await resolver.resolve('NODE1.example.com');
    expect(lookup).toHaveBeenCalledTimes(1);

    now = 10 * 60 * 1000;
    await resolver.resolve('node1.example.com');
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('treats resolution failures as having no addresses', async () => {
    const resolver = new HostResolver(jest.fn().mockRejectedValue(new Error('ENOTFOUND')));
    expect(await resolver.resolveAll(['gone.example.com'])).toEqual([
      { host: 'gone.example.com', addresses: [] },
    ]);
  });
});
