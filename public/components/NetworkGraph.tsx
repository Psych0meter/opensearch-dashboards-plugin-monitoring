import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { Text } from '@visx/text';

interface Node {
  id: string;
  name: string;
  host: string;
  roles: string[];
  zone: string | null;
}

interface NetworkGraphProps {
  nodes: Node[];
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({ nodes }) => {
  // Constants for spacing
  const zoneMargin = 40;
  const roleMargin = 20;
  const padding = 10;
  const hostSpacing = 18;
  const roleTitleHeight = 20;
  const rolePadding = 10;

  // Group nodes by zone and then role
  const zoneMap = useMemo(() => {
    const map: Record<string, Record<string, string[]>> = {};
    nodes.forEach(n => {
      const zone = (n.zone || 'default').trim();
      if (!map[zone]) map[zone] = {};
      n.roles.forEach(roleRaw => {
        const role = roleRaw.trim();
        if (!map[zone][role]) map[zone][role] = [];
        map[zone][role].push(n.name);
      });
    });
    // Sort hosts
    Object.keys(map).forEach(zone => {
      Object.keys(map[zone]).forEach(role => {
        map[zone][role].sort();
      });
    });
    return map;
  }, [nodes]);

  const zones = Object.keys(zoneMap).sort();

  // Calculate width per zone
  const zoneWidth = 220;
  const totalWidth = zones.length * (zoneWidth + zoneMargin);

  // Calculate height based on max content
  const calculatedZoneHeights = zones.map(zone => {
    const roles = Object.keys(zoneMap[zone]);
    return roles.reduce((acc, role) => {
      const hosts = zoneMap[zone][role].length;
      const blockHeight = roleTitleHeight + rolePadding + hosts * hostSpacing + padding;
      return acc + blockHeight + roleMargin;
    }, 40); // extra for zone title
  });

  const zoneHeightsMap = zones.reduce<Record<string, number>>((acc, zone, i) => {
    acc[zone] = calculatedZoneHeights[i];
    return acc;
  }, {});

  const totalHeight = Math.max(...calculatedZoneHeights);

  // Position map for lines
  useMemo(() => {
    const positions: Record<string, { x: number; y: number }[]> = {};
    zones.forEach((zone, zoneIdx) => {
      const zoneX = zoneIdx * (zoneWidth + zoneMargin);
      const roles = Object.keys(zoneMap[zone]).sort();

      let roleOffsetY = 40;
      roles.forEach(role => {
        const hosts = zoneMap[zone][role];
        hosts.forEach((hostLabel, hostIdx) => {
          const x = zoneX + padding + (zoneWidth - 2 * padding) / 2;
          const y = roleOffsetY + roleTitleHeight + rolePadding + hostIdx * hostSpacing;
          if (!positions[hostLabel]) positions[hostLabel] = [];
          positions[hostLabel].push({ x, y });
        });
        // Add height for this role block
        roleOffsetY += roleTitleHeight + rolePadding + hosts.length * hostSpacing + roleMargin;
      });
    });
    return positions;
  }, [zoneMap, zones]);

  return (
    <svg width={totalWidth} height={totalHeight}>
      {zones.map((zone, zoneIdx) => {
        const roles = Object.keys(zoneMap[zone]).sort();
        const zoneX = zoneIdx * (zoneWidth + zoneMargin);

        let offsetY = 40;

        return (
          <Group key={zone} left={zoneX}>
            {/* Zone background */}
            <rect
              x={0}
              y={0}
              width={zoneWidth}
              height={zoneHeightsMap[zone]}
              fill="#ccc"
              opacity={0.15}
              stroke="#777"
              strokeWidth={2}
              rx={6}
              ry={6}
            />
            {/* Zone title */}
            <Text
              x={zoneWidth / 2}
              y={20}
              fontWeight="bold"
              fontSize={16}
              textAnchor="middle"
              fill="#000"
            >
              {`Zone: ${zone}`}
            </Text>

            {/* Roles */}
            {roles.map(role => {
              const hosts = zoneMap[zone][role];
              const roleBlockHeight =
                roleTitleHeight + rolePadding + hosts.length * hostSpacing;

              const roleGroup = (
                <Group key={role} top={offsetY} left={padding}>
                  <rect
                    x={0}
                    y={0}
                    width={zoneWidth - 2 * padding}
                    height={roleBlockHeight}
                    fill="#8fa"
                    opacity={0.3}
                    stroke="#484"
                    strokeWidth={1.5}
                    rx={4}
                    ry={4}
                  />
                  <Text
                    x={(zoneWidth - 2 * padding) / 2}
                    y={16}
                    fontWeight={600}
                    fontSize={13}
                    textAnchor="middle"
                    fill="#000"
                  >
                    {`Role: ${role}`}
                  </Text>
                  {hosts.map((hostLabel, i) => (
                    <Text
                      key={hostLabel}
                      x={(zoneWidth - 2 * padding) / 2}
                      y={roleTitleHeight + rolePadding + i * hostSpacing}
                      fontSize={11}
                      fill="#222"
                      textAnchor="middle"
                    >
                      {hostLabel}
                    </Text>
                  ))}
                </Group>
              );

              offsetY += roleBlockHeight + roleMargin;
              return roleGroup;
            })}
          </Group>
        );
      })}
    </svg>
  );
};
