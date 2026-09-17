import React, { useEffect, useMemo, useState } from 'react';
import { Group } from '@visx/group';
import { Text } from '@visx/text';
import { euiPaletteColorBlind } from '@elastic/eui';

interface Node {
  id: string;
  name: string;
  host: string;
  roles: string[];
  zone: string | null;
}

interface NetworkGraphProps {
  nodes: Node[];
  missingNodes?: string[];
  maxColumns?: number;
}

const NO_ROLE_BUCKET = 'coordinating_only';

const BASE_PALETTE = euiPaletteColorBlind();

const ROLE_COLORS: Record<string, string> = {
  cluster_manager: BASE_PALETTE[1],
  master: BASE_PALETTE[1],
  data: BASE_PALETTE[0],
  ingest: BASE_PALETTE[3],
  coordinating_only: BASE_PALETTE[7],
  remote_cluster_client: BASE_PALETTE[5],
  search: BASE_PALETTE[9],
  warm: BASE_PALETTE[6],
};
const DEFAULT_ROLE_COLOR = BASE_PALETTE[8];
const MISSING_COLOR = BASE_PALETTE[2];

const getRoleColor = (role: string): string => ROLE_COLORS[role] ?? DEFAULT_ROLE_COLOR;

interface HostRow {
  name: string;
  y: number;
}

interface RoleBlock {
  role: string;
  y: number;
  height: number;
  hosts: HostRow[];
}

interface ZoneCard {
  kind: 'zone';
  key: string;
  zone: string;
  roles: RoleBlock[];
  height: number;
  hostCount: number;
}

interface MissingCard {
  kind: 'missing';
  key: string;
  hosts: HostRow[];
  height: number;
}

type Card = ZoneCard | MissingCard;

// Layout constants (all in px)
const CARD_WIDTH = 300;
const CARD_GAP = 40;
const CARD_TITLE_HEIGHT = 50;
const CARD_INNER_PADDING = 16;
const ROLE_MARGIN = 20;
const ROLE_TITLE_HEIGHT = 28;
const ROLE_TOP_PADDING = 12;
const ROLE_BOTTOM_PADDING = 10;
const HOST_ROW_HEIGHT = 24;
const DOT_RADIUS = 4.5;
const DOT_X = CARD_INNER_PADDING + 11;
const LABEL_X = DOT_X + 14;

// The graph never claims more than this fraction of the window's width, so
// it can never dominate the page even when every zone fits on one row.
const MAX_WIDTH_FRACTION_OF_WINDOW = 0.5;

/**
 * How many zone-columns fit per row, driven by window width.
 */
function useAvailableColumns(cardCount: number, maxColumns?: number): number {
  const getColumns = () => {
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const widthBudget = windowWidth * MAX_WIDTH_FRACTION_OF_WINDOW;
    const columnsThatFit = Math.max(1, Math.floor((widthBudget + CARD_GAP) / (CARD_WIDTH + CARD_GAP)));
    return Math.max(1, Math.min(cardCount || 1, maxColumns ?? Infinity, columnsThatFit));
  };

  const [columns, setColumns] = useState(getColumns);

  useEffect(() => {
    const onResize = () => setColumns(getColumns());
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, [cardCount, maxColumns]);

  return columns;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ nodes, missingNodes = [], maxColumns }) => {
  // Group node names by zone, then by role. Nodes with no roles reported
  // still get placed, under a synthetic "coordinating_only" bucket.
  const zoneMap = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    nodes.forEach(n => {
      const zone = (n.zone || 'default').trim();
      const roles = n.roles && n.roles.length > 0 ? n.roles : [NO_ROLE_BUCKET];
      if (!map[zone]) map[zone] = {};
      roles.forEach(roleRaw => {
        const role = roleRaw.trim();
        if (!map[zone][role]) map[zone][role] = [];
        map[zone][role].push(n.name);
      });
    });
    Object.keys(map).forEach(zone => {
      Object.keys(map[zone]).forEach(role => {
        map[zone][role] = Array.from(new Set(map[zone][role])).sort();
      });
    });
    return map;
  }, [nodes]);

  const zones = Object.keys(zoneMap).sort();

  // One card per zone, sized to its own content.
  const zoneCards: ZoneCard[] = useMemo(() => {
    return zones.map(zone => {
      const roleNames = Object.keys(zoneMap[zone]).sort();
      let cursorY = CARD_TITLE_HEIGHT;
      const roles: RoleBlock[] = roleNames.map(role => {
        const hostNames = zoneMap[zone][role];
        const blockTop = cursorY;
        const hosts: HostRow[] = hostNames.map((name, idx) => ({
          name,
          y: blockTop + ROLE_TITLE_HEIGHT + ROLE_TOP_PADDING + idx * HOST_ROW_HEIGHT + HOST_ROW_HEIGHT / 2,
        }));
        const height =
          ROLE_TITLE_HEIGHT + ROLE_TOP_PADDING + hostNames.length * HOST_ROW_HEIGHT + ROLE_BOTTOM_PADDING;
        cursorY = blockTop + height + ROLE_MARGIN;
        return { role, y: blockTop, height, hosts };
      });

      const uniqueHosts = new Set<string>();
      roleNames.forEach(role => zoneMap[zone][role].forEach(h => uniqueHosts.add(h)));

      return {
        kind: 'zone',
        key: `zone:${zone}`,
        zone,
        roles,
        height: cursorY - ROLE_MARGIN + CARD_INNER_PADDING,
        hostCount: uniqueHosts.size,
      };
    });
  }, [zoneMap, zones]);

  // Configured-but-not-reporting nodes get one extra card.
  const missingCard: MissingCard | null = useMemo(() => {
    if (missingNodes.length === 0) return null;
    const sorted = Array.from(new Set(missingNodes)).sort();
    const hosts: HostRow[] = sorted.map((name, idx) => ({
      name,
      y: CARD_TITLE_HEIGHT + ROLE_TOP_PADDING + idx * HOST_ROW_HEIGHT + HOST_ROW_HEIGHT / 2,
    }));
    return {
      kind: 'missing',
      key: 'missing',
      hosts,
      height: CARD_TITLE_HEIGHT + ROLE_TOP_PADDING + sorted.length * HOST_ROW_HEIGHT + ROLE_BOTTOM_PADDING + CARD_INNER_PADDING,
    };
  }, [missingNodes]);

  const cards: Card[] = missingCard ? [...zoneCards, missingCard] : zoneCards;
  const columns = useAvailableColumns(cards.length, maxColumns);

  const layout = useMemo(() => {
    const rowYOffsets: number[] = [];
    let cursorY = 0;
    for (let i = 0; i < cards.length; i += columns) {
      const row = cards.slice(i, i + columns);
      rowYOffsets.push(cursorY);
      const rowHeight = row.reduce((max, c) => Math.max(max, c.height), 0);
      cursorY += rowHeight + CARD_GAP;
    }
    return {
      rowYOffsets,
      totalHeight: Math.max(0, cursorY - CARD_GAP),
    };
  }, [cards, columns]);

  const totalWidth = columns * CARD_WIDTH + Math.max(0, columns - 1) * CARD_GAP;

  if (cards.length === 0) {
    return null;
  }

  return (
    <svg
      width={totalWidth}
      height={layout.totalHeight}
      viewBox={`0 0 ${totalWidth} ${layout.totalHeight}`}
      role="img"
      aria-label="Cluster topology grouped by zone and role"
    >
      {cards.map((card, i) => {
        const row = Math.floor(i / columns);
        const col = i % columns;
        const x = col * (CARD_WIDTH + CARD_GAP);
        const y = layout.rowYOffsets[row];

        if (card.kind === 'missing') {
          return (
            <Group key={card.key} left={x} top={y}>
              <rect
                x={0}
                y={0}
                width={CARD_WIDTH}
                height={card.height}
                fill='#FDF0F0'
                stroke={MISSING_COLOR}
                strokeWidth={1}
                strokeDasharray='4 3'
                rx={10}
                ry={10}
              />
              <Text x={CARD_WIDTH / 2} y={26} fontWeight={700} fontSize={18} textAnchor='middle' fill={MISSING_COLOR}>
                Missing Nodes
              </Text>
              <Text x={CARD_WIDTH / 2} y={43} fontSize={12} textAnchor='middle' fill='#A13333'>
                {`${card.hosts.length} configured, not reporting`}
              </Text>
              {card.hosts.map(host => (
                <Group key={host.name}>
                  <circle cx={DOT_X} cy={host.y} r={DOT_RADIUS} fill={MISSING_COLOR} />
                  <text x={LABEL_X} y={host.y} dominantBaseline='central' fontSize={13} fill='#7A2222'>
                    {host.name}
                  </text>
                </Group>
              ))}
            </Group>
          );
        }

        return (
          <Group key={card.key} left={x} top={y}>
            <rect
              x={0}
              y={0}
              width={CARD_WIDTH}
              height={card.height}
              fill='#FFFFFF'
              stroke='#D3DAE6'
              strokeWidth={1}
              rx={10}
              ry={10}
            />
            <Text x={CARD_WIDTH / 2} y={26} fontWeight={700} fontSize={18} textAnchor='middle' fill='#1A1C21'>
              {`Zone: ${card.zone}`}
            </Text>
            <Text x={CARD_WIDTH / 2} y={43} fontSize={12} textAnchor='middle' fill='#69707D'>
              {`${card.hostCount} node${card.hostCount !== 1 ? 's' : ''}`}
            </Text>

            {card.roles.map(roleBlock => {
              const color = getRoleColor(roleBlock.role);
              return (
                <Group key={roleBlock.role} top={roleBlock.y} left={CARD_INNER_PADDING}>
                  <rect
                    x={0}
                    y={0}
                    width={CARD_WIDTH - 2 * CARD_INNER_PADDING}
                    height={roleBlock.height}
                    fill={color}
                    opacity={0.06}
                    stroke={color}
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    rx={7}
                    ry={7}
                  />
                  <rect x={0} y={0} width={4} height={roleBlock.height} fill={color} rx={2} />
                  <Text x={16} y={19} fontWeight={600} fontSize={14} fill={color}>
                    {`Role: ${roleBlock.role}`}
                  </Text>
                  {roleBlock.hosts.map(host => (
                    <Group key={host.name}>
                      <circle cx={11} cy={host.y - roleBlock.y} r={DOT_RADIUS} fill={color} />
                      <text x={25} y={host.y - roleBlock.y} dominantBaseline='central' fontSize={13} fill='#25272E'>
                        {host.name}
                      </text>
                    </Group>
                  ))}
                </Group>
              );
            })}
          </Group>
        );
      })}
    </svg>
  );
};
