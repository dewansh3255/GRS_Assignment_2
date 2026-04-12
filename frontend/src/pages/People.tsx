import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getMyProfile,
  searchUsers,
  getMyConnections,
  sendConnectionRequest,
  respondToConnection,
  removeConnection,
  getMyProfileViewers,
  getConnectionSuggestions,
} from '../services/api';

// ── Types ──────────────────────────────────────────────────────────────

interface UserCard {
  id: number;
  username: string;
  headline: string;
  role: string;
  connection_status: 'none' | 'pending_sent' | 'pending_received' | 'connected';
  connection_id: number | null;
}

interface ConnEntry {
  id: number;
  username: string;
  role: string;
  headline: string;
  status: string;
  created_at: string;
}

interface FeedPost {
  id: number;
  author_username: string;
  author_role: string;
  content: string;
  created_at: string;
  is_mine: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────

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
    case 'ADMIN':     return 'bg-red-100 text-red-700 border-red-200';
    default:          return 'bg-blue-100 text-blue-700 border-blue-200';
  }
};

const timeAgo = (iso: string) => {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
};

// ── Sub-component: User Card ────────────────────────────────────────────

function UserCardUI({
  user, onConnect, onView, onRespond, onRemove, loading,
}: {
  user: UserCard;
  onConnect: () => void;
  onView: () => void;
  onRespond: (id: number, action: 'ACCEPT' | 'REJECT') => void;
  onRemove: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all duration-200 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient(user.username)} flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0`}>
          {user.username[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 truncate">{user.username}</p>
          {user.headline && <p className="text-xs text-gray-500 truncate mt-0.5">{user.headline}</p>}
          <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold border ${roleBadge(user.role)}`}>
            {user.role}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={onView}
          className="w-full py-2 rounded-xl bg-gray-50 text-gray-700 text-sm font-medium hover:bg-gray-100 transition border border-gray-100"
        >
          View Profile
        </button>

        {user.connection_status === 'none' && (
          <button onClick={onConnect} disabled={loading}
            className="w-full py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
            {loading ? 'Sending…' : '+ Connect'}
          </button>
        )}
        {user.connection_status === 'pending_sent' && (
          <div className="w-full py-2 rounded-xl bg-gray-100 text-gray-400 text-sm text-center font-medium">Pending…</div>
        )}
        {user.connection_status === 'pending_received' && (
          <div className="flex gap-2">
            <button onClick={() => onRespond(user.connection_id!, 'ACCEPT')} disabled={loading}
              className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50">Accept</button>
            <button onClick={() => onRespond(user.connection_id!, 'REJECT')} disabled={loading}
              className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">Ignore</button>
          </div>
        )}
        {user.connection_status === 'connected' && (
          <button onClick={onRemove} disabled={loading}
            className="w-full py-2 rounded-xl bg-gray-100 text-gray-500 text-sm font-medium hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50">
            ✓ Connected · Remove
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export default function People() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [profile, setProfile] = useState<any>(null);
  const query = searchParams.get('q') || '';
  const [searchResults, setSearchResults] = useState<UserCard[]>([]);
  const [suggestions, setSuggestions] = useState<UserCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [connections, setConnections] = useState<{
    connections: ConnEntry[];
    pending_received: ConnEntry[];
    pending_sent: ConnEntry[];
  }>({ connections: [], pending_received: [], pending_sent: [] });

  const [viewers, setViewers] = useState<{ viewers: any[]; view_count: number; hidden: boolean }>({
    viewers: [], view_count: 0, hidden: false,
  });

  const [activeTab, setActiveTab] = useState<'network' | 'requests'>('network');
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);

  // ── Load on mount ───────────────────────────────────────────────────

  // ── Data loaders ────────────────────────────────────────────────────

  const loadConnections = () =>
    getMyConnections().then(setConnections).catch(console.error);

  const loadSuggestions = () =>
    getConnectionSuggestions().then(setSuggestions).catch(console.error);

  const loadViewers = () =>
    getMyProfileViewers().then(setViewers).catch(console.error);

  const doSearch = async (q: string) => {
    setSearchLoading(true);
    try { setSearchResults(await searchUsers(q)); }
    catch (e) { console.error(e); }
    finally { setSearchLoading(false); }
  };

  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch(err => { if (err.message === 'Unauthorized') navigate('/login'); });
    loadConnections();
    loadSuggestions();
    loadViewers();
  }, [navigate]);

  useEffect(() => {
    if (query.length >= 2) {
      const t = setTimeout(() => doSearch(query), 350);
      return () => clearTimeout(t);
    } else {
      setSearchResults([]);
    }
  }, [query]);

  // ── Actions ─────────────────────────────────────────────────────────

  const handleConnect = async (username: string, userId: number) => {
    setActionLoading(userId);
    try {
      const r = await sendConnectionRequest(username);
      setSearchResults(prev => prev.map(u =>
        u.username === username ? { ...u, connection_status: 'pending_sent', connection_id: r.id } : u
      ));
      setSuggestions(prev => prev.map(u =>
        u.username === username ? { ...u, connection_status: 'pending_sent', connection_id: r.id } : u
      ));
      loadConnections();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRespond = async (connId: number, action: 'ACCEPT' | 'REJECT') => {
    setActionLoading(connId);
    try {
      await respondToConnection(connId, action);
      await loadConnections();
      if (query.length >= 2) doSearch(query);
      else loadSuggestions();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handleRemove = async (connId: number) => {
    if (!confirm('Remove this connection?')) return;
    setActionLoading(connId);
    try {
      await removeConnection(connId);
      loadConnections();
      if (query.length >= 2) doSearch(query);
      else loadSuggestions();
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  // ── Render ──────────────────────────────────────────────────────────

  const isSearching = query.length >= 2;
  const pendingCount = connections.pending_received.length;

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={profile?.role} username={profile?.username} />

      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">People</h1>
          <p className="text-gray-500 mt-1">Discover professionals, grow your network</p>
        </div>

        {/* ── Center search bar removed for duplication ── */}


        {/* ── SEARCH STATE ───────────────────────────────────────────── */}
        {isSearching ? (
          <div>
            <p className="text-sm text-gray-500 mb-4 font-medium">
              {searchLoading ? 'Searching…' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${query}"`}
            </p>

            {!searchLoading && searchResults.length === 0 ? (
              <div className="text-center py-20 text-gray-400">
                <div className="text-5xl mb-3">🔍</div>
                <p className="font-medium">No users found</p>
                <p className="text-sm mt-1">Try a different name or headline keyword</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map(user => (
                  <UserCardUI
                    key={user.id}
                    user={user}
                    loading={actionLoading !== null && (actionLoading === user.id || actionLoading === user.connection_id)}
                    onView={() => navigate(`/profile/${user.username}`)}
                    onConnect={() => handleConnect(user.username, user.id)}
                    onRespond={handleRespond}
                    onRemove={() => handleRemove(user.connection_id!)}
                  />
                ))}
              </div>
            )}
          </div>

        ) : (
          <>
            {/* ── Profile View Stats ──────────────────────────────────── */}
            {!viewers.hidden && viewers.view_count > 0 && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5 mb-6 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-blue-900 text-lg">{viewers.view_count} profile views</p>
                  <p className="text-sm text-blue-600">In the last 30 days</p>
                </div>
                <div className="flex -space-x-2">
                  {viewers.viewers.slice(0, 5).map((v, i) => (
                    <button
                      key={i}
                      onClick={() => navigate(`/profile/${v.username}`)}
                      title={v.username}
                      className={`w-9 h-9 rounded-full bg-gradient-to-br ${avatarGradient(v.username)} border-2 border-white flex items-center justify-center text-white text-xs font-bold hover:scale-110 transition-transform`}
                    >
                      {v.username[0].toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Tabs ────────────────────────────────────────────────── */}
            <div className="flex justify-between items-center bg-transparent mb-6">
              <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
                {([
                  { key: 'network',  label: `My Network (${connections.connections.length})` },
                  { key: 'requests', label: 'Requests',  badge: pendingCount },
                ] as { key: string; label: string; badge?: number }[]).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`relative px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                      activeTab === tab.key
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab.label}
                    {tab.badge && tab.badge > 0 ? (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                        {tab.badge}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            </div>


            {/* ── Tab: My Network ─────────────────────────────────────── */}
            {activeTab === 'network' && (
              connections.connections.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">🤝</div>
                  <p className="text-lg font-medium">No connections yet</p>
                  <p className="text-sm mt-1">Use the search bar above to find people to connect with</p>
                </div>
              ) : (
                <div className="mb-8">
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Your Connections</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {connections.connections.map(conn => (
                      <div key={conn.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all">
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${avatarGradient(conn.username)} flex items-center justify-center text-white font-bold text-lg shadow-sm`}>
                            {conn.username[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-900 truncate">{conn.username}</p>
                            {conn.headline && <p className="text-xs text-gray-500 truncate">{conn.headline}</p>}
                          <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-semibold border ${roleBadge(conn.role)}`}>
                            {conn.role}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => navigate(`/profile/${conn.username}`)}
                          className="flex-1 py-1.5 rounded-xl bg-blue-50 text-blue-700 text-sm font-medium hover:bg-blue-100 transition">
                          View Profile
                        </button>
                        <button onClick={() => handleRemove(conn.id)} disabled={actionLoading === conn.id}
                          className="px-3 py-1.5 rounded-xl bg-gray-100 text-gray-500 text-sm hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50">
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              )
            )}

            {/* ── Suggestions (always below connections) ────────────────── */}
            {suggestions.length > 0 && activeTab === 'network' && (
              <div className="mt-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">People you may know</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {suggestions.map(user => (
                    <UserCardUI
                      key={user.id}
                      user={user}
                      loading={actionLoading !== null && (actionLoading === user.id || actionLoading === user.connection_id)}
                      onView={() => navigate(`/profile/${user.username}`)}
                      onConnect={() => handleConnect(user.username, user.id)}
                      onRespond={handleRespond}
                      onRemove={() => handleRemove(user.connection_id!)}
                    />
                  ))}
                </div>
              </div>
            )}


            {/* ── Tab: Requests ───────────────────────────────────────── */}
            {activeTab === 'requests' && (
              <div className="space-y-6">
                {/* Incoming */}
                {connections.pending_received.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Incoming Requests</h3>
                    <div className="space-y-3">
                      {connections.pending_received.map(conn => (
                        <div key={conn.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient(conn.username)} flex items-center justify-center text-white font-bold shrink-0`}>
                              {conn.username[0].toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 truncate">{conn.username}</p>
                              {conn.headline && <p className="text-xs text-gray-500 truncate">{conn.headline}</p>}
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${roleBadge(conn.role)}`}>
                                {conn.role}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => handleRespond(conn.id, 'ACCEPT')} disabled={actionLoading === conn.id}
                              className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                              Accept
                            </button>
                            <button onClick={() => handleRespond(conn.id, 'REJECT')} disabled={actionLoading === conn.id}
                              className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                              Ignore
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Outgoing */}
                {connections.pending_sent.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Sent Requests</h3>
                    <div className="space-y-3">
                      {connections.pending_sent.map(conn => (
                        <div key={conn.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${avatarGradient(conn.username)} flex items-center justify-center text-white font-bold`}>
                              {conn.username[0].toUpperCase()}
                            </div>
                            <div>
                              <p className="font-semibold text-gray-900">{conn.username}</p>
                              {conn.headline && <p className="text-xs text-gray-500">{conn.headline}</p>}
                            </div>
                          </div>
                          <span className="text-sm text-gray-400 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-full">Pending…</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {connections.pending_received.length === 0 && connections.pending_sent.length === 0 && (
                  <div className="text-center py-24 text-gray-400">
                    <div className="text-6xl mb-4">📬</div>
                    <p className="text-lg font-medium">No pending requests</p>
                  </div>
                )}
              </div>
            )}
            {/* ── Feed Tab Removed for Dashboard Only ── */}
          </>
        )}
      </div>
    </div>
  );
}
