/**
 * Compares the expected node inventory (the hosts listed in
 * `opensearch.hosts`) with the nodes actually reporting in the cluster.
 *
 * A configured host rarely equals a node's `name`: it may be an FQDN while
 * the node is called `os-data-01`, an IP address, or a name bound to the
 * node's publish address. A host is therefore considered present when ANY
 * of its identifiers (the host string, its short name, the addresses it
 * resolves to) equals ANY identifier of a node (name, host, IP, transport
 * and HTTP publish addresses, and their short names).
 *
 * When no configured host matches any node at all, the inventory is most
 * likely a load balancer, proxy or DNS alias rather than a node list; the
 * comparison is then flagged as unreliable so the UI can stay quiet instead
 * of reporting every node as unexpected and the endpoint as missing.
 */

/** A host taken from `opensearch.hosts`, with the addresses it resolves to. */
export interface ExpectedHost {
  host: string;
  addresses: string[];
}

/** The identifying fields of a reporting node. */
export interface NodeIdentity {
  name: string;
  host?: string | null;
  ip?: string | null;
  transport_address?: string | null;
  http_address?: string | null;
}

export type InventoryUnreliableReason = 'no_hosts' | 'no_match';

export interface InventoryComparison {
  /** False when the configured hosts can't be used as a node inventory. */
  reliable: boolean;
  reason: InventoryUnreliableReason | null;
  /** Configured hosts that match no reporting node. */
  missingHosts: string[];
  /** Reporting node names that no configured host matches. */
  unexpectedNodes: string[];
  /**
   * Number of nodes the inventory accounts for: every matched node plus
   * one per missing host. A single host that matches several nodes (e.g. a
   * round-robin DNS name) contributes all the nodes it matches.
   */
  expectedCount: number;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function isIpAddress(value: string): boolean {
  return IPV4.test(value) || value.includes(':');
}

/**
 * Lower-cases, strips IPv6 brackets and a trailing root dot.
 */
export function normalizeHost(value: string): string {
  let result = value.trim().toLowerCase();
  if (result.startsWith('[') && result.endsWith(']')) result = result.slice(1, -1);
  if (result.endsWith('.')) result = result.slice(0, -1);
  return result;
}

/**
 * Splits an OpenSearch publish address into its host/IP parts. Handles
 * `1.2.3.4:9300`, `node1.example.com/1.2.3.4:9200`, `[::1]:9300` and
 * `inet[/1.2.3.4:9300]`.
 */
export function parsePublishAddress(address: string): string[] {
  let value = address.trim();
  const inet = /^inet\[(.*)\]$/.exec(value);
  if (inet) value = inet[1];

  return value
    .split('/')
    .filter((part) => part.length > 0)
    .map((part) => {
      const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(part);
      if (bracketed) return bracketed[1];
      // host:port or ipv4:port - but leave bare IPv6 (several colons) alone
      const colonCount = (part.match(/:/g) ?? []).length;
      if (colonCount === 1) return part.slice(0, part.indexOf(':'));
      return part;
    });
}

/**
 * Adds a normalized identifier, and for host names its first DNS label
 * (`node1.example.com` -> `node1`), to the given set.
 */
function addIdentifier(target: Set<string>, value: string | null | undefined): void {
  if (!value) return;
  const normalized = normalizeHost(value);
  if (!normalized) return;
  target.add(normalized);
  if (!isIpAddress(normalized) && normalized.includes('.')) {
    target.add(normalized.slice(0, normalized.indexOf('.')));
  }
}

export function getNodeIdentifiers(node: NodeIdentity): Set<string> {
  const ids = new Set<string>();
  addIdentifier(ids, node.name);
  addIdentifier(ids, node.host);
  addIdentifier(ids, node.ip);
  [node.transport_address, node.http_address].forEach((address) => {
    if (address) parsePublishAddress(address).forEach((part) => addIdentifier(ids, part));
  });
  return ids;
}

export function getHostIdentifiers(expected: ExpectedHost): Set<string> {
  const ids = new Set<string>();
  addIdentifier(ids, expected.host);
  expected.addresses.forEach((address) => addIdentifier(ids, address));
  return ids;
}

function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) {
    if (b.has(value)) return true;
  }
  return false;
}

export function compareInventory(
  expectedHosts: ExpectedHost[],
  nodes: NodeIdentity[]
): InventoryComparison {
  if (expectedHosts.length === 0) {
    return {
      reliable: false,
      reason: 'no_hosts',
      missingHosts: [],
      unexpectedNodes: [],
      expectedCount: 0,
    };
  }

  const nodeIds = nodes.map((node) => ({ node, ids: getNodeIdentifiers(node) }));
  const matchedNodes = new Set<NodeIdentity>();
  const missingHosts: string[] = [];

  expectedHosts.forEach((expected) => {
    const hostIds = getHostIdentifiers(expected);
    const matches = nodeIds.filter(({ ids }) => intersects(hostIds, ids));
    if (matches.length === 0) {
      missingHosts.push(expected.host);
    } else {
      matches.forEach(({ node }) => matchedNodes.add(node));
    }
  });

  if (nodes.length > 0 && matchedNodes.size === 0) {
    return {
      reliable: false,
      reason: 'no_match',
      missingHosts: [],
      unexpectedNodes: [],
      expectedCount: 0,
    };
  }

  const unexpectedNodes = nodes
    .filter((node) => !matchedNodes.has(node))
    .map((node) => node.name)
    .sort();

  return {
    reliable: true,
    reason: null,
    missingHosts: Array.from(new Set(missingHosts)).sort(),
    unexpectedNodes,
    expectedCount: matchedNodes.size + new Set(missingHosts).size,
  };
}
