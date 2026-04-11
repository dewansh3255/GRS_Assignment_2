import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getNetworkGraph, getMyProfile } from '../services/api';

interface GraphNode {
  id: number;
  username: string;
  role: string;
  degree: 0 | 1 | 2;
}

const avatarGradient = (name: string) => {
  const g = [
    'from-blue-500 to-cyan-500',
    'from-purple-500 to-pink-500',
    'from-emerald-500 to-teal-500',
    'from-orange-500 to-red-500',
    'from-indigo-500 to-blue-500',
    'from-rose-500 to-pink-500',
  ];
  return g[name.charCodeAt(0) % g.length];
};

const roleBadge = (role: string) => {
  switch (role) {
    case 'RECRUITER': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'ADMIN': return 'bg-red-100 text-red-700 border-red-200';
    default: return 'bg-blue-100 text-blue-700 border-blue-200';
  }
};

export default function NetworkGraph() {
  const navigate = useNavigate();

  const [myProfile, setMyProfile] = useState<any>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMyProfile(), getNetworkGraph()])
      .then(([profile, g]) => {
        setMyProfile(profile);
        setNodes(g.nodes || []);
      })
      .catch(err => { if (err.message === 'Unauthorized') navigate('/login'); })
      .finally(() => setLoading(false));
  }, [navigate]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />
      <div className="flex items-center justify-center h-96 text-gray-400">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p>Loading your network…</p>
        </div>
      </div>
    </div>
  );

  const firstDegree = nodes.filter(n => n.degree === 1);
  const secondDegree = nodes.filter(n => n.degree === 2);

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Network</h1>
          <p className="text-gray-500 mt-1">Manage your connections up to 2 degrees away</p>
        </div>

        {nodes.length <= 1 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            <div className="text-6xl mb-4">&#127760;</div>
            <p className="font-semibold text-lg text-gray-800">No connections yet</p>
            <p className="text-sm mt-1">Connect with people to grow your network</p>
            <button onClick={() => navigate('/people')} className="mt-5 px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
              Find People to Connect
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* 1st Degree */}
            <div>
              <div className="flex items-center mb-4 gap-2">
                <h2 className="text-xl font-bold text-gray-900">1st Degree</h2>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-0.5 rounded-full">{firstDegree.length}</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">Direct connections in your network.</p>

              <div className="space-y-3">
                {firstDegree.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">None</p>
                ) : (
                  firstDegree.map(node => (
                    <div key={node.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between hover:shadow-md transition">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${avatarGradient(node.username)} flex items-center justify-center text-white font-bold text-lg shrink-0`}>
                          {node.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900">{node.username}</p>
                          <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold border ${roleBadge(node.role)}`}>
                            {node.role}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/profile/${node.username}`)} className="text-blue-600 text-sm font-semibold hover:underline">
                        View
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2nd Degree */}
            <div>
              <div className="flex items-center mb-4 gap-2">
                <h2 className="text-xl font-bold text-gray-900">2nd Degree</h2>
                <span className="bg-gray-200 text-gray-800 text-xs font-bold px-2 py-0.5 rounded-full">{secondDegree.length}</span>
              </div>
              <p className="text-sm text-gray-500 mb-4">Connections of your connections.</p>

              <div className="space-y-3">
                {secondDegree.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">None</p>
                ) : (
                  secondDegree.map(node => (
                    <div key={node.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between hover:shadow-md transition opacity-80 hover:opacity-100">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${avatarGradient(node.username)} flex items-center justify-center text-white font-bold shrink-0 shadow-inner`}>
                          {node.username[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">{node.username}</p>
                          <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold border ${roleBadge(node.role)}`}>
                            {node.role}
                          </span>
                        </div>
                      </div>
                      <button onClick={() => navigate(`/profile/${node.username}`)} className="text-gray-500 text-sm font-semibold hover:text-blue-600 transition">
                        View
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
