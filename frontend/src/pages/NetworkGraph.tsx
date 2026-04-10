import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getNetworkGraph, getMyProfile, sendConnectionRequest } from '../services/api';

// ── Types ────────────────────────────────────────────────────────────────

interface GraphNode {
  id: number;
  username: string;
  role: string;
  degree: 0 | 1 | 2;
  x?: number;
  y?: number;
}

interface GraphEdge {
  from: number;
  to: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const NODE_COLORS: Record<number, { fill: string; stroke: string; text: string }> = {
  0: { fill: '#1d4ed8', stroke: '#1e40af', text: '#fff' },   // you — deep blue
  1: { fill: '#3b82f6', stroke: '#2563eb', text: '#fff' },   // 1st degree — blue
  2: { fill: '#e2e8f0', stroke: '#94a3b8', text: '#475569' }, // 2nd degree — gray
};

const NODE_RADIUS: Record<number, number> = { 0: 28, 1: 20, 2: 13 };

const GRAD_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4',
];
const roleLabel = (role: string) =>
  role === 'RECRUITER' ? '🏢' : role === 'ADMIN' ? '🔑' : '👤';

// ── Layout algorithm ─────────────────────────────────────────────────────

function computeLayout(nodes: GraphNode[], edges: GraphEdge[], cx: number, cy: number) {
  const placed = new Map<number, { x: number; y: number }>();
  const me = nodes.find(n => n.degree === 0);
  if (!me) return nodes;

  placed.set(me.id, { x: cx, y: cy });

  const first = nodes.filter(n => n.degree === 1);
  const R1 = Math.min(180, 60 + first.length * 20);
  first.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / first.length - Math.PI / 2;
    placed.set(n.id, { x: cx + R1 * Math.cos(angle), y: cy + R1 * Math.sin(angle) });
  });

  const second = nodes.filter(n => n.degree === 2);
  let s2idx = 0;
  first.forEach((parent, pi) => {
    const parentPos = placed.get(parent.id)!;
    const parentAngle = (2 * Math.PI * pi) / first.length - Math.PI / 2;
    // 2nd degree nodes adjacent to this parent (from edges)
    const child2 = edges
      .filter(e => (e.from === parent.id || e.to === parent.id))
      .map(e => (e.from === parent.id ? e.to : e.from))
      .filter(id => second.some(n => n.id === id));

    const unique2 = [...new Set(child2)].slice(0, 4);
    unique2.forEach((cid, ci) => {
      if (!placed.has(cid)) {
        const spread = Math.PI / 3;
        const angle = parentAngle + (ci - (unique2.length - 1) / 2) * (spread / Math.max(unique2.length, 1));
        const R2 = 90;
        placed.set(cid, {
          x: parentPos.x + R2 * Math.cos(angle),
          y: parentPos.y + R2 * Math.sin(angle),
        });
      }
      s2idx++;
    });
  });

  // Place any leftover 2nd-degree nodes not yet placed in outer ring
  second.forEach(n => {
    if (!placed.has(n.id)) {
      const angle = (2 * Math.PI * s2idx) / Math.max(second.length, 1);
      placed.set(n.id, { x: cx + 280 * Math.cos(angle), y: cy + 220 * Math.sin(angle) });
      s2idx++;
    }
  });

  return nodes.map(n => ({ ...n, ...(placed.get(n.id) ?? { x: cx, y: cy }) }));
}

// ── Main Component ────────────────────────────────────────────────────────

export default function NetworkGraph() {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);

  const [myProfile, setMyProfile] = useState<any>(null);
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [layoutNodes, setLayoutNodes] = useState<GraphNode[]>([]);
  const [hoveredNode, setHoveredNode] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionLoading, setConnectionLoading] = useState<number | null>(null);

  const W = 900, H = 520, CX = 450, CY = 260;

  useEffect(() => {
    Promise.all([getMyProfile(), getNetworkGraph()])
      .then(([profile, g]) => {
        setMyProfile(profile);
        setGraph(g);
        const laid = computeLayout(g.nodes, g.edges, CX, CY);
        setLayoutNodes(laid);
      })
      .catch(err => { if (err.message === 'Unauthorized') navigate('/login'); })
      .finally(() => setLoading(false));
  }, [navigate]);

  const handleConnect = async (username: string, nodeId: number) => {
    setConnectionLoading(nodeId);
    try {
      await sendConnectionRequest(username);
      // Refresh graph
      const g = await getNetworkGraph();
      setGraph(g);
      setLayoutNodes(computeLayout(g.nodes, g.edges, CX, CY));
    } catch (e: any) { alert(e.message); }
    finally { setConnectionLoading(null); }
  };

  const nodePos = (id: number) => layoutNodes.find(n => n.id === id) ?? { x: CX, y: CY };

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />
      <div className="flex items-center justify-center h-96 text-gray-400">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p>Building your network graph…</p>
        </div>
      </div>
    </div>
  );

  const firstCount = graph?.nodes.filter(n => n.degree === 1).length ?? 0;
  const secondCount = graph?.nodes.filter(n => n.degree === 2).length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">My Network Graph</h1>
          <p className="text-gray-500 mt-1">Visualising your connections up to 2 degrees away</p>
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap gap-3 mb-6">
          {[
            { label: 'You',                 count: 1,            color: 'bg-blue-600 text-white' },
            { label: '1st Connections',     count: firstCount,   color: 'bg-blue-100 text-blue-800' },
            { label: '2nd Connections',     count: secondCount,  color: 'bg-gray-100 text-gray-700' },
          ].map(s => (
            <div key={s.label} className={`px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2 ${s.color}`}>
              <span className="text-lg font-bold">{s.count}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        {/* Graph SVG */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          {layoutNodes.length === 0 || firstCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <div className="text-6xl mb-4">&#127760;</div>
              <p className="font-semibold text-lg">No connections yet</p>
              <p className="text-sm mt-1">Connect with people and your graph will appear here</p>
              <button onClick={() => navigate('/people')} className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
                Find People to Connect
              </button>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              className="w-full"
              style={{ maxHeight: 520 }}
            >
              {/* Defs: gradients */}
              <defs>
                <radialGradient id="glow-center" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Background glow at center */}
              <ellipse cx={CX} cy={CY} rx={200} ry={150} fill="url(#glow-center)" />

              {/* Edges */}
              {graph?.edges.map((edge, i) => {
                const from = nodePos(edge.from);
                const to = nodePos(edge.to);
                const fromNode = layoutNodes.find(n => n.id === edge.from);
                const toNode = layoutNodes.find(n => n.id === edge.to);
                const is2nd = fromNode?.degree === 2 || toNode?.degree === 2;
                return (
                  <line
                    key={i}
                    x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                    stroke={is2nd ? '#e2e8f0' : '#93c5fd'}
                    strokeWidth={is2nd ? 1 : 1.5}
                    strokeDasharray={is2nd ? '5,4' : undefined}
                    opacity={0.8}
                  />
                );
              })}

              {/* Nodes */}
              {layoutNodes.map(node => {
                const r = NODE_RADIUS[node.degree] ?? 13;
                const colors = NODE_COLORS[node.degree] ?? NODE_COLORS[2];
                const isHovered = hoveredNode === node.id;
                const label = node.username.length > 10 ? node.username.slice(0, 9) + '…' : node.username;

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    className="cursor-pointer"
                    onClick={() => node.degree !== 0 && navigate(`/profile/${node.username}`)}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    style={{ transition: 'transform 0.2s' }}
                  >
                    {/* Hover ring */}
                    {isHovered && (
                      <circle r={r + 6} fill="none" stroke={colors.fill} strokeWidth={2} opacity={0.4} />
                    )}

                    {/* Node circle */}
                    <circle
                      r={r}
                      fill={colors.fill}
                      stroke={colors.stroke}
                      strokeWidth={2}
                      style={{ filter: isHovered ? 'drop-shadow(0 2px 8px rgba(0,0,0,0.25))' : 'none', transition: 'all 0.15s' }}
                    />

                    {/* Initials or icon */}
                    {node.degree <= 1 ? (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={colors.text}
                        fontSize={node.degree === 0 ? 14 : 10}
                        fontWeight="700"
                      >
                        {node.username[0].toUpperCase()}
                      </text>
                    ) : (
                      <text textAnchor="middle" dominantBaseline="central" fontSize={8} fill={colors.text}>
                        {node.username[0].toUpperCase()}
                      </text>
                    )}

                    {/* Username label (shown for degree 0 and 1, and on hover for degree 2) */}
                    {(node.degree <= 1 || isHovered) && (
                      <text
                        y={r + 12}
                        textAnchor="middle"
                        fill="#374151"
                        fontSize={node.degree === 0 ? 11 : 9}
                        fontWeight={node.degree === 0 ? '700' : '500'}
                      >
                        {label}
                      </text>
                    )}

                    {/* Role emoji for degree 0 and 1 */}
                    {node.degree <= 1 && (
                      <text y={r + 22} textAnchor="middle" fontSize={7} fill="#9ca3af">
                        {roleLabel(node.role)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Legend */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Legend</h3>
          <div className="flex flex-wrap gap-6">
            {[
              { color: '#1d4ed8', label: 'You', desc: 'Your profile' },
              { color: '#3b82f6', label: '1st Degree', desc: 'Direct connections — click to view profile' },
              { color: '#e2e8f0', label: '2nd Degree', desc: 'Friends of friends — hover to see name' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border-2 shrink-0" style={{ background: item.color, borderColor: item.color }} />
                <div>
                  <span className="text-sm font-semibold text-gray-800">{item.label}</span>
                  <span className="text-xs text-gray-400 ml-2">{item.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
