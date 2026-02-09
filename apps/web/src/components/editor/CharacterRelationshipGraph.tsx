import { useMemo } from 'react';
import type { Character, CharacterRelationshipRecord } from '@/types';
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from '@xyflow/react';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import '@xyflow/react/dist/style.css';

type GraphNode = SimulationNodeDatum & {
  id: string;
  name: string;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  source: string;
  target: string;
};

export function CharacterRelationshipGraph(props: {
  characters: Character[];
  relationships: CharacterRelationshipRecord[];
  height?: number;
}) {
  const { characters, relationships, height = 360 } = props;

  const { nodes, edges } = useMemo(() => {
    if (relationships.length === 0) {
      return { nodes: [] as Node[], edges: [] as Edge[] };
    }

    const graphNodes: GraphNode[] = characters.map((character) => ({
      id: character.id,
      name: character.name,
      x: Math.random() * 600 - 300,
      y: Math.random() * 300 - 150,
    }));

    const links: GraphLink[] = relationships
      .filter((row) => row.fromCharacterId !== row.toCharacterId)
      .filter(
        (row) =>
          graphNodes.some((node) => node.id === row.fromCharacterId) &&
          graphNodes.some((node) => node.id === row.toCharacterId),
      )
      .map((row) => ({
        source: row.fromCharacterId,
        target: row.toCharacterId,
      }));

    if (graphNodes.length > 0) {
      const simulation = forceSimulation(graphNodes)
        .force('charge', forceManyBody().strength(-220))
        .force(
          'link',
          forceLink<GraphNode, GraphLink>(links)
            .id((d) => d.id)
            .distance(130)
            .strength(0.5),
        )
        .force('center', forceCenter(0, 0))
        .force('x', forceX(0).strength(0.05))
        .force('y', forceY(0).strength(0.05))
        .stop();

      for (let i = 0; i < 180; i += 1) simulation.tick();
    }

    const flowNodes: Node[] = graphNodes.map((node) => ({
      id: node.id,
      type: 'default',
      position: { x: node.x ?? 0, y: node.y ?? 0 },
      data: { label: `角色: ${node.name}` },
      draggable: false,
    }));

    const flowEdges: Edge[] = relationships
      .filter((row) => row.fromCharacterId !== row.toCharacterId)
      .map((row) => ({
        id: row.id,
        source: row.fromCharacterId,
        target: row.toCharacterId,
        label: row.label || row.type,
      }));

    return { nodes: flowNodes, edges: flowEdges };
  }, [characters, relationships]);

  if (nodes.length === 0 || edges.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        暂无角色关系图谱数据。
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card" style={{ height }}>
      <ReactFlow nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.2 }}>
        <MiniMap />
        <Controls showInteractive={false} />
        <Background />
      </ReactFlow>
    </div>
  );
}
