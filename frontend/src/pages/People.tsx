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
  getFeed,
  createPost,
  getMyProfileViewers,
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
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [searchResults, setSearchResults] = useState<UserCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [connections, setConnections] = useState<{
    connections: ConnEntry[];
    pending_received: ConnEntry[];
    pending_sent: ConnEntry[];
  }>({ connections: [], pending_received: [], pending_sent: [] });

  const [feed, setFeed] = useState<FeedPost[]>([]);
  const [newPost, setNewPost] = useState('');
  const [posting, setPosting] = useState(false);

  const [viewers, setViewers] = useState<{ viewers: any[]; view_count: number; hidden: boolean }>({
    viewers: [], view_count: 0, hidden: false,
  });

  const [activeTab, setActiveTab] = useState<'network' | 'requests' | 'feed'>('network');
  const [actionLoading, setActionLoading] = useState<number | string | null>(null);

  // ── Load on mount ───────────────────────────────────────────────────

  useEffect(() => {
    getMyProfile()
      .then(setProfile)
      .catch(err => { if (err.message === 'Unauthorized') navigate('/login'); });
    loadConnections();
    loadFeed();
    loadViewers();
  }, [navigate]);

  // Trigger search if a ?q= param is present on load
  useEffect(() => {
    if (query.length >= 2) doSearch(query);
  }, []);

  // Debounced live search
  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(() => doSearch(query), 350);
    return () => clearTimeout(t);
  }, [query]);

  // ── Data loaders ────────────────────────────────────────────────────

  const loadConnections = () =>
    getMyConnections().then(setConnections).catch(console.error);

  const loadFeed = () =>
    getFeed().then(setFeed).catch(console.error);

  const loadViewers = () =>
    getMyProfileViewers().then(setViewers).catch(console.error);

  const doSearch = async (q: string) => {
    setSearchLoading(true);
    try { setSearchResults(await searchUsers(q)); }
    catch (e) { console.error(e); }
    finally { setSearchLoading(false); }
  };

  // ── Actions ─────────────────────────────────────────────────────────

  const handleConnect = async (username: string, userId: number) => {
    setActionLoading(userId);
    try {
      const r = await sendConnectionRequest(username);
      setSearchResults(prev => prev.map(u =>
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
      await Promise.all([loadConnections(), loadFeed()]);
      // Also refresh search results connection status
      if (query.length >= 2) doSearch(query);
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
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(null); }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      const p = await createPost(newPost.trim());
      setFeed(prev => [p, ...prev]);
      setNewPost('');
    } catch (e: any) { alert(e.message); }
    finally { setPosting(false); }
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

        {/* ── Search Bar ─────────────────────────────────────────────── */}
        <div className="relative mb-8">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="people-search"
            type="text"
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name or headline…"
            className="w-full pl-12 pr-10 py-4 text-base bg-white border border-gray-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 transition"
          />
          {query && (
            <button onClick={() => setQuery('')}
              className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-gray-600 transition">
              ✕
            </button>
          )}
        </div>

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
                    loading={actionLoading === user.id || actionLoading === user.connection_id}
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
            <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6 w-fit">
              {([
                { key: 'network',  label: `My Network (${connections.connections.length})` },
                { key: 'requests', label: 'Requests',  badge: pendingCount },
                { key: 'feed',     label: 'Feed' },
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

            {/* ── Tab: My Network ─────────────────────────────────────── */}
            {activeTab === 'network' && (
              connections.connections.length === 0 ? (
                <div className="text-center py-24 text-gray-400">
                  <div className="text-6xl mb-4">🤝</div>
                  <p className="text-lg font-medium">No connections yet</p>
                  <p className="text-sm mt-1">Use the search bar above to find people to connect with</p>
                </div>
              ) : (
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
              )
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

            {/* ── Tab: Feed ───────────────────────────────────────────── */}
            {activeTab === 'feed' && (
              <div className="max-w-2xl space-y-4">
                {/* Composer */}
                <form onSubmit={handlePost} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${profile ? avatarGradient(profile.username) : 'from-gray-400 to-gray-500'} flex items-center justify-center text-white font-bold shrink-0`}>
                      {profile?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <textarea
                      value={newPost}
                      onChange={e => setNewPost(e.target.value)}
                      placeholder="Share something with your network…"
                      rows={3}
                      className="flex-1 p-3 bg-gray-50 rounded-xl resize-none border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-gray-800 placeholder-gray-400"
                    />
                  </div>
                  <div className="flex justify-end mt-3">
                    <button type="submit" disabled={!newPost.trim() || posting}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                      {posting ? 'Posting…' : 'Post'}
                    </button>
                  </div>
                </form>

                {/* Posts */}
                {feed.length === 0 ? (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-5xl mb-4">📝</div>
                    <p className="font-medium">No posts yet</p>
                    <p className="text-sm mt-1">Connect with people and their posts will appear here</p>
                  </div>
                ) : (
                  feed.map(post => (
                    <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${avatarGradient(post.author_username)} flex items-center justify-center text-white font-bold shrink-0`}>
                          {post.author_username[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <button onClick={() => navigate(`/profile/${post.author_username}`)}
                            className="font-semibold text-gray-900 hover:text-blue-600 transition text-sm">
                            {post.author_username}
                          </button>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${roleBadge(post.author_role)}`}>
                              {post.author_role}
                            </span>
                            <span className="text-xs text-gray-400">{timeAgo(post.created_at)}</span>
                          </div>
                        </div>
                        {post.is_mine && (
                          <span className="text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg shrink-0">You</span>
                        )}
                      </div>
                      <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
