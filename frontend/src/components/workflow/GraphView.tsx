import { useMemo, useEffect, useRef } from "react";
import type { WorkflowGraph, WorkflowNode, WorkflowEdge, Bottleneck } from "../../types/workflow";

// Design tokens
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const T2 = "#9898a8";

// Node colors
const RED = "#ef4444";
const RED_STROKE = "#dc2626";
const AMBER = "#f59e0b";
const AMBER_STROKE = "#d97706";
const GREEN = "#22c55e";
const GREEN_STROKE = "#16a34a";
const GRAY = "#6b7280";
const GRAY_STROKE = "#4b5563";

// Layout constants
const H_SPACING = 200;
const V_SPACING = 120;
const PADDING = 60;
const NODE_W = 140;
const NODE_H = 60;
const DIAMOND_SIZE = 70;

interface GraphViewProps {
  graph: WorkflowGraph;
  bottlenecks: Bottleneck[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onDeselect?: () => void;
}

interface LayoutNode {
  node: WorkflowNode;
  x: number;
  y: number;
  layer: number;
  isBottleneck: boolean;
}

// ─── Layout Algorithm ───

function computeLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  bottleneckIds: Set<string>
): { layoutNodes: LayoutNode[]; svgWidth: number; svgHeight: number } {
  if (nodes.length === 0) {
    return { layoutNodes: [], svgWidth: 200, svgHeight: 200 };
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Build adjacency
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, []);
    outgoing.set(n.id, []);
  }
  for (const e of edges) {
    if (nodeMap.has(e.source_id) && nodeMap.has(e.target_id)) {
      outgoing.get(e.source_id)!.push(e.target_id);
      incoming.get(e.target_id)!.push(e.source_id);
    }
  }

  // Layer assignment via iterative relaxation (handles diamonds)
  const layers = new Map<string, number>();
  const roots = nodes.filter((n) => incoming.get(n.id)!.length === 0);
  if (roots.length === 0) roots.push(nodes[0]);
  for (const n of nodes) layers.set(n.id, 0);

  let changed = true;
  let iterations = 0;
  while (changed && iterations < 20) {
    changed = false;
    iterations++;
    for (const e of edges) {
      if (!nodeMap.has(e.source_id) || !nodeMap.has(e.target_id)) continue;
      const srcLayer = layers.get(e.source_id) ?? 0;
      const tgtLayer = layers.get(e.target_id) ?? 0;
      if (tgtLayer <= srcLayer) {
        layers.set(e.target_id, srcLayer + 1);
        changed = true;
      }
    }
  }

  // Group by layer and compute positions
  const layerGroups = new Map<number, string[]>();
  for (const [id, layer] of layers) {
    if (!layerGroups.has(layer)) layerGroups.set(layer, []);
    layerGroups.get(layer)!.push(id);
  }

  const layoutNodes: LayoutNode[] = [];
  for (const [layer, ids] of layerGroups) {
    const count = ids.length;
    const totalWidth = (count - 1) * H_SPACING;
    const startX = -totalWidth / 2;

    ids.forEach((id, i) => {
      const node = nodeMap.get(id)!;
      layoutNodes.push({
        node,
        x: startX + i * H_SPACING,
        y: layer * V_SPACING,
        layer,
        isBottleneck: bottleneckIds.has(id),
      });
    });
  }

  // Normalize to PADDING
  const minX = Math.min(...layoutNodes.map((n) => n.x));
  const minY = Math.min(...layoutNodes.map((n) => n.y));
  for (const ln of layoutNodes) {
    ln.x -= minX - PADDING;
    ln.y -= minY - PADDING;
  }

  const svgWidth = Math.max(...layoutNodes.map((n) => n.x)) + NODE_W / 2 + PADDING;
  const svgHeight = Math.max(...layoutNodes.map((n) => n.y)) + NODE_H + PADDING;

  return {
    layoutNodes,
    svgWidth: Math.max(svgWidth, 300),
    svgHeight: Math.max(svgHeight, 200),
  };
}

// ─── Helpers ───

function getNodeFill(node: WorkflowNode, isBottleneck: boolean): string {
  if (node.node_type === "decision") return GRAY;
  if (!node.is_manual) return GREEN;
  if (isBottleneck) return RED;
  return AMBER;
}

function getNodeStroke(node: WorkflowNode, isBottleneck: boolean): string {
  if (node.node_type === "decision") return GRAY_STROKE;
  if (!node.is_manual) return GREEN_STROKE;
  if (isBottleneck) return RED_STROKE;
  return AMBER_STROKE;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

// ─── Node Shape Components ───

function NodeShape({
  ln,
  isSelected,
  onClick,
}: {
  ln: LayoutNode;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { node, x, y, isBottleneck } = ln;
  const fill = getNodeFill(node, isBottleneck);
  const stroke = getNodeStroke(node, isBottleneck);
  const textColor = "#fff";
  const selectedStroke = isSelected ? AC : stroke;
  const selectedWidth = isSelected ? 3 : 1.5;

  const nameText = truncate(node.name, 10);
  const toolText = node.tool_used ? `${node.tool_used}` : null;
  const timeText = node.avg_time_minutes ? `${node.avg_time_minutes}分钟` : null;

  const lines = [nameText, toolText, timeText].filter(Boolean);
  const lineHeight = 14;
  const textStartY = -(((lines.length - 1) * lineHeight) / 2);

  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Invisible touch hit-area (min 44×44px for mobile tapping) */}
      <rect
        x={Math.min(-NODE_W / 2, -22)}
        y={Math.min(-NODE_H / 2, -22)}
        width={Math.max(NODE_W, 44)}
        height={Math.max(NODE_H, 44)}
        fill="transparent"
        style={{ pointerEvents: "all" }}
      />
      {/* Selection glow — drop shadow filter applied to outer glow rect */}
      {isSelected && (
        <rect
          x={-NODE_W / 2 - 5}
          y={-NODE_H / 2 - 5}
          width={NODE_W + 10}
          height={NODE_H + 10}
          rx={13}
          fill="none"
          stroke={AC}
          strokeWidth={2.5}
          opacity={0.7}
          filter="url(#nodeGlow)"
        />
      )}

      {/* Shape */}
      {node.node_type === "decision" ? (
        <g>
          <rect
            x={-DIAMOND_SIZE / 2}
            y={-DIAMOND_SIZE / 2}
            width={DIAMOND_SIZE}
            height={DIAMOND_SIZE}
            rx={4}
            fill={fill}
            stroke={selectedStroke}
            strokeWidth={selectedWidth}
            transform="rotate(45)"
          />
        </g>
      ) : node.node_type === "approval" ? (
        <g>
          <rect
            x={-NODE_W / 2 - 3}
            y={-NODE_H / 2 - 3}
            width={NODE_W + 6}
            height={NODE_H + 6}
            rx={10}
            fill="none"
            stroke={selectedStroke}
            strokeWidth={1}
          />
          <rect
            x={-NODE_W / 2}
            y={-NODE_H / 2}
            width={NODE_W}
            height={NODE_H}
            rx={8}
            fill={fill}
            stroke={selectedStroke}
            strokeWidth={selectedWidth}
          />
        </g>
      ) : node.node_type === "handoff" ? (
        <polygon
          points={hexPoints(NODE_W * 0.52, NODE_H * 0.52)}
          fill={fill}
          stroke={selectedStroke}
          strokeWidth={selectedWidth}
        />
      ) : node.node_type === "notification" ? (
        <rect
          x={-NODE_W / 2}
          y={-NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={fill}
          stroke={selectedStroke}
          strokeWidth={selectedWidth}
          strokeDasharray="6,3"
        />
      ) : (
        /* task, data_entry — rounded rect */
        <rect
          x={-NODE_W / 2}
          y={-NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill={fill}
          stroke={selectedStroke}
          strokeWidth={selectedWidth}
        />
      )}

      {/* Text content */}
      {lines.map((line, i) => (
        <text
          key={i}
          x={0}
          y={textStartY + i * lineHeight + 4}
          textAnchor="middle"
          fill={textColor}
          fontSize={i === 0 ? 12 : 10}
          fontWeight={i === 0 ? 600 : 400}
          fontFamily="system-ui, sans-serif"
          opacity={i === 0 ? 1 : 0.8}
          style={{ pointerEvents: "none" }}
        >
          {i === 1 && toolText ? `📊 ${line}` : i === 2 ? `⏱ ${line}` : line}
        </text>
      ))}

      {/* Bottleneck pulse */}
      {isBottleneck && node.node_type !== "decision" && (
        <rect
          x={-NODE_W / 2}
          y={-NODE_H / 2}
          width={NODE_W}
          height={NODE_H}
          rx={8}
          fill="none"
          stroke={RED}
          strokeWidth={2}
          opacity={0.6}
        >
          <animate
            attributeName="opacity"
            values="0.6;0.15;0.6"
            dur="2s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-width"
            values="2;4;2"
            dur="2s"
            repeatCount="indefinite"
          />
        </rect>
      )}
    </g>
  );
}

function hexPoints(hw: number, hh: number): string {
  return [
    `${-hw},0`,
    `${-hw * 0.5},${-hh}`,
    `${hw * 0.5},${-hh}`,
    `${hw},0`,
    `${hw * 0.5},${hh}`,
    `${-hw * 0.5},${hh}`,
  ].join(" ");
}

// ─── Edge Component ───

function EdgePath({
  edge,
  sourcePos,
  targetPos,
}: {
  edge: WorkflowEdge;
  sourcePos: { x: number; y: number };
  targetPos: { x: number; y: number };
}) {
  const sx = sourcePos.x;
  const sy = sourcePos.y + NODE_H / 2;
  const tx = targetPos.x;
  const ty = targetPos.y - NODE_H / 2;

  const cp = Math.max(Math.abs(ty - sy) * 0.35, 30);
  const d = `M ${sx} ${sy} C ${sx} ${sy + cp}, ${tx} ${ty - cp}, ${tx} ${ty}`;

  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;

  return (
    <g>
      <path
        d={d}
        fill="none"
        stroke="#4a4a5a"
        strokeWidth={2}
        markerEnd="url(#arrowhead)"
      />
      {edge.condition && (
        <g transform={`translate(${mx}, ${my})`}>
          <rect
            x={-(edge.condition.length * 5.5 + 12) / 2}
            y={-10}
            width={edge.condition.length * 5.5 + 12}
            height={20}
            rx={4}
            fill={S2}
            stroke={BD}
            strokeWidth={1}
          />
          <text
            x={0}
            y={4}
            textAnchor="middle"
            fill={T2}
            fontSize={11}
            fontFamily="system-ui, sans-serif"
            style={{ pointerEvents: "none" }}
          >
            {edge.condition}
          </text>
        </g>
      )}
    </g>
  );
}

// ─── Legend ───

function Legend() {
  const items = [
    { color: RED, label: "手动瓶颈 Bottleneck" },
    { color: AMBER, label: "手动步骤 Manual" },
    { color: GREEN, label: "已自动化 Automated" },
    { color: GRAY, label: "决策/交接 Decision" },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        padding: "12px 0",
        justifyContent: "center",
      }}
    >
      {items.map((item) => (
        <div
          key={item.color}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: T2,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: item.color,
            }}
          />
          {item.label}
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───

export default function GraphView({
  graph,
  bottlenecks,
  selectedNodeId,
  onNodeClick,
  onDeselect,
}: GraphViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const bottleneckIds = useMemo(
    () => new Set(bottlenecks.map((b) => b.node_id)),
    [bottlenecks]
  );

  const { layoutNodes, svgWidth, svgHeight } = useMemo(
    () => computeLayout(graph.nodes, graph.edges, bottleneckIds),
    [graph.nodes, graph.edges, bottleneckIds]
  );

  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const ln of layoutNodes) {
      m.set(ln.node.id, { x: ln.x, y: ln.y });
    }
    return m;
  }, [layoutNodes]);

  // Auto-scroll SVG container to keep selected node visible
  useEffect(() => {
    if (!selectedNodeId || !containerRef.current) return;
    const ln = layoutNodes.find((n) => n.node.id === selectedNodeId);
    if (!ln) return;
    const container = containerRef.current;
    const scrollLeft = ln.x - container.clientWidth / 2;
    const scrollTop = ln.y - container.clientHeight / 2;
    container.scrollTo({
      left: Math.max(0, scrollLeft),
      top: Math.max(0, scrollTop),
      behavior: "smooth",
    });
  }, [selectedNodeId, layoutNodes]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div
        ref={containerRef}
        style={{
          flex: 1,
          overflow: "auto",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          background: `radial-gradient(circle, ${BD}22 1px, transparent 1px)`,
          backgroundSize: "20px 20px",
          borderRadius: 8,
        }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ display: "block", minWidth: svgWidth }}
          onClick={(e) => {
            // Deselect when clicking empty SVG background
            if (e.target === e.currentTarget && onDeselect) {
              onDeselect();
            }
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="7"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#4a4a5a" />
            </marker>
            {/* Glow filter for selected nodes */}
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow
                dx="0"
                dy="0"
                stdDeviation="6"
                floodColor={AC}
                floodOpacity="0.8"
              />
            </filter>
          </defs>

          {/* Edges (rendered first, under nodes) */}
          {graph.edges.map((edge, i) => {
            const sp = posMap.get(edge.source_id);
            const tp = posMap.get(edge.target_id);
            if (!sp || !tp) return null;
            return (
              <EdgePath
                key={`e-${i}`}
                edge={edge}
                sourcePos={sp}
                targetPos={tp}
              />
            );
          })}

          {/* Nodes */}
          {layoutNodes.map((ln) => (
            <NodeShape
              key={ln.node.id}
              ln={ln}
              isSelected={selectedNodeId === ln.node.id}
              onClick={() => onNodeClick(ln.node.id)}
            />
          ))}
        </svg>
      </div>
      <Legend />
    </div>
  );
}
