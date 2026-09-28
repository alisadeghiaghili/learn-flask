/**
 * SVG visualization of the Flask application graph.
 *
 * Nodes: app → blueprints → routes/hooks. Layout is a simple layered tree.
 */

import type { FlaskApp, RouteRule } from '../model/types';

export interface AppGraphViewProps {
  app: FlaskApp;
}

interface PlacedNode {
  id: string;
  kind: 'app' | 'blueprint' | 'route' | 'hook';
  x: number;
  y: number;
  label: string;
  sub: string;
}

const NODE_W = 132;
const NODE_H = 44;
const GAP_X = 18;
const GAP_Y = 18;

/**
 * Render the application graph as inline SVG.
 *
 * Args:
 *   props: Parsed FlaskApp to visualize.
 *
 * Returns:
 *   SVG element describing the current app structure.
 */
export function AppGraphView({ app }: AppGraphViewProps) {
  const { nodes, edges, width, height } = layout(app);

  if (app.routes.length === 0 && app.blueprints.length === 0 && app.hooks.length === 0) {
    return (
      <div className="graph-empty">
        No routes yet. Write <code>@app.route(...)</code> in the editor — the graph updates live.
      </div>
    );
  }

  return (
    <svg
      className="graph-canvas"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Flask application graph"
    >
      {edges.map((e, i) => (
        <path key={`e-${i}`} className="edge" d={e} />
      ))}
      {nodes.map((n) => (
        <g key={n.id}>
          <rect
            className={nodeClass(n.kind)}
            x={n.x}
            y={n.y}
            width={NODE_W}
            height={NODE_H}
            rx={8}
          />
          <text className="node-label" x={n.x + NODE_W / 2} y={n.y + 16}>
            {truncate(n.label, 16)}
          </text>
          <text className="node-sub" x={n.x + NODE_W / 2} y={n.y + 32}>
            {truncate(n.sub, 18)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function nodeClass(kind: PlacedNode['kind']): string {
  switch (kind) {
    case 'app':
      return 'node-app';
    case 'blueprint':
      return 'node-bp';
    case 'route':
      return 'node-route';
    case 'hook':
      return 'node-hook';
    default:
      return 'node-route';
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function layout(app: FlaskApp): {
  nodes: PlacedNode[];
  edges: string[];
  width: number;
  height: number;
} {
  const nodes: PlacedNode[] = [];
  const edges: string[] = [];

  // Row 0: app
  const appLabel = app.appName ?? 'app';
  const rootX = 40;
  const rootY = 24;
  nodes.push({
    id: 'app',
    kind: 'app',
    x: rootX,
    y: rootY,
    label: appLabel,
    sub: 'Flask(__name__)',
  });

  // App-level routes and hooks as row 1 left cluster
  const appRoutes = app.routes.filter((r) => !r.blueprint);
  const appHooks = app.hooks.filter((h) => !h.owner);

  // Blueprints
  const bpNodes: { name: string; routes: RouteRule[] }[] = app.blueprints.map((bp) => ({
    name: bp.name,
    routes: app.routes.filter((r) => r.blueprint === bp.name),
  }));

  // Place app children
  let cursorX = rootX;
  const row1Y = rootY + NODE_H + GAP_Y + 20;
  const children: PlacedNode[] = [];

  for (const r of appRoutes) {
    const n: PlacedNode = {
      id: `r:${r.endpoint}:${r.rule}`,
      kind: 'route',
      x: cursorX,
      y: row1Y,
      label: `${r.methods[0] ?? 'GET'} ${r.rule}`,
      sub: r.endpoint,
    };
    children.push(n);
    cursorX += NODE_W + GAP_X;
  }

  for (const h of appHooks) {
    const n: PlacedNode = {
      id: `h:${h.name}`,
      kind: 'hook',
      x: cursorX,
      y: row1Y,
      label: h.kind === 'errorhandler' ? `error ${h.code}` : h.kind,
      sub: h.name,
    };
    children.push(n);
    cursorX += NODE_W + GAP_X;
  }

  for (const bp of bpNodes) {
    const n: PlacedNode = {
      id: `bp:${bp.name}`,
      kind: 'blueprint',
      x: cursorX,
      y: row1Y,
      label: bp.name,
      sub: app.blueprints.find((b) => b.name === bp.name)?.urlPrefix ?? 'blueprint',
    };
    children.push(n);
    cursorX += NODE_W + GAP_X;
  }

  nodes.push(...children);

  // Blueprint route children (row 2 under each bp)
  for (const bp of bpNodes) {
    const bpNode = children.find((c) => c.id === `bp:${bp.name}`);
    if (!bpNode) continue;
    let bx = bpNode.x;
    const row2Y = row1Y + NODE_H + GAP_Y + 16;
    for (const r of bp.routes) {
      const n: PlacedNode = {
        id: `r:${r.endpoint}:${r.rule}`,
        kind: 'route',
        x: bx,
        y: row2Y,
        label: `${r.methods[0] ?? 'GET'} ${r.rule}`,
        sub: r.endpoint,
      };
      nodes.push(n);
      edges.push(edgePath(bpNode.x + NODE_W / 2, bpNode.y + NODE_H, n.x + NODE_W / 2, n.y));
      bx += NODE_W + GAP_X;
    }
  }

  // Edges from app to row1
  for (const c of children) {
    edges.push(edgePath(rootX + NODE_W / 2, rootY + NODE_H, c.x + NODE_W / 2, c.y));
  }

  const width = Math.max(rootX + NODE_W + 40, cursorX + 40);
  const height = row1Y + NODE_H + (bpNodes.some((b) => b.routes.length) ? NODE_H + GAP_Y + 16 : 0) + 50;

  return { nodes, edges, width: Math.max(width, 480), height: Math.max(height, 220) };
}

function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}
