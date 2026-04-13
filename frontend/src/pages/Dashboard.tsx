import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

import {
  getMyProfile, getFeed, createPost,
  getMyConnections, getConnectionSuggestions, sendConnectionRequest,
  getMyProfileViewers,
} from '../services/api';

const GRAD = (name: string) => {
  const g = ['from-blue-500 to-cyan-500','from-purple-500 to-pink-500','from-emerald-500 to-teal-500','from-orange-500 to-red-500','from-indigo-500 to-blue-500'];
  return g[(name || 'U').charCodeAt(0) % g.length];
};

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
};

const roleBadge = (role: string) => {
  switch (role) {
    case 'RECRUITER': return 'bg-purple-100 text-purple-700 border-purple-200';
    case 'ADMIN':     return 'bg-red-100 text-red-700 border-red-200';
    default:          return 'bg-blue-100 text-blue-700 border-blue-200';
  }
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [profile, setProfile]           = useState<any>(null);
  const [feed, setFeed]                 = useState<any[]>([]);
  const [connections, setConnections]   = useState<any[]>([]);
  const [suggestions, setSuggestions]   = useState<any[]>([]);
  const [viewCount, setViewCount]       = useState(0);
  const [newPost, setNewPost]           = useState('');
  const [showComposer, setShowComposer] = useState(false);
  const [posting, setPosting]           = useState(false);
  const [connLoading, setConnLoading]   = useState<number | null>(null);

  useEffect(() => {
    loadAll();
  }, [navigate]);

  const loadAll = async () => {
    try {
      const [p, f, c, s, v] = await Promise.all([
        getMyProfile(),
        getFeed(),
        getMyConnections(),
        getConnectionSuggestions(),
        getMyProfileViewers(),
      ]);
      if (!p) { navigate('/login'); return; }
      setProfile(p);
      setFeed(f);
      setConnections(c.connections ?? []);
      setSuggestions(s.slice(0, 3));
      setViewCount(v.view_count ?? 0);
    } catch (err: any) {
      if (err.message === 'Unauthorized') navigate('/login');
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;
    setPosting(true);
    try {
      const p = await createPost(newPost.trim());
      setFeed(prev => [p, ...prev]);
      setNewPost('');
      setShowComposer(false);
    } catch (e: any) { alert(e.message); }
    finally { setPosting(false); }
  };

  const handleConnect = async (username: string, idx: number) => {
    setConnLoading(idx);
    try {
      await sendConnectionRequest(username);
      setSuggestions(prev => prev.filter((_, i) => i !== idx));
    } catch (e: any) { alert(e.message); }
    finally { setConnLoading(null); }
  };

  if (!profile) return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center text-gray-400">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
        <p>Loading your feed…</p>
      </div>
    </div>
  );

  const firstName = profile.username.split(/[._-]/)[0];

  return (
    <div className="min-h-screen" style={{ background: '#f1f5f9' }}>
      <Navbar role={profile.role} username={profile.username} />

      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[270px_1fr] gap-5">

          {/* ────────────────── LEFT SIDEBAR ────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-[72px] h-fit">

            {/* Mini profile card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-16" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #3b82f6 60%, #06b6d4 100%)' }} />
              <div className="px-4 pb-4 -mt-7">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${GRAD(profile.username)} flex items-center justify-center text-white font-bold text-2xl border-3 border-white shadow-md mb-2 overflow-hidden`}>
                  {profile.profile_picture_url
                    ? <img src={profile.profile_picture_url} className="w-full h-full object-cover" alt="" />
                    : profile.username[0].toUpperCase()}
                </div>
                <p className="font-bold text-gray-900">{profile.username}</p>
                {profile.headline && <p className="text-xs text-gray-500 mt-0.5 leading-snug line-clamp-2">{profile.headline}</p>}

                <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                  <button
                    onClick={() => navigate('/my-profile')}
                    className="w-full text-xs text-left flex justify-between items-center text-gray-500 hover:text-blue-600 transition py-1"
                  >
                    <span>&#128065; Profile views</span>
                    <span className="font-bold text-gray-900">{viewCount}</span>
                  </button>
                  <button
                    onClick={() => navigate('/people')}
                    className="w-full text-xs text-left flex justify-between items-center text-gray-500 hover:text-blue-600 transition py-1"
                  >
                    <span>&#129309; Connections</span>
                    <span className="font-bold text-gray-900">{connections.length}</span>
                  </button>
                </div>

                <button
                  onClick={() => navigate('/my-profile')}
                  className="mt-3 w-full py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-full transition"
                >
                  View full profile
                </button>
              </div>
            </div>

            {/* People You May Know */}
            {suggestions.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-bold text-gray-900">People you may know</h3>
                  <button onClick={() => navigate('/people')} className="text-xs text-blue-600 hover:underline">See all</button>
                </div>
                <div className="space-y-4">
                  {suggestions.map((s, i) => (
                    <div key={s.id} className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg bg-gradient-to-br ${GRAD(s.username)} flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden`}>
                        {s.profile_picture_url
                          ? <img src={s.profile_picture_url} className="w-full h-full object-cover" alt="Profile" />
                          : s.username[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <button onClick={() => navigate(`/profile/${s.username}`)}
                          className="font-semibold text-gray-900 text-xs hover:text-blue-600 transition block truncate">
                          {s.username}
                        </button>
                        {s.headline && <p className="text-[11px] text-gray-400 truncate">{s.headline}</p>}
                        <p className="text-[10px] text-gray-400">{s.mutual_connections} mutual connection{s.mutual_connections !== 1 ? 's' : ''}</p>
                        <button
                          onClick={() => handleConnect(s.username, i)}
                          disabled={connLoading === i}
                          className="mt-1 text-[11px] font-semibold text-blue-600 border border-blue-200 px-3 py-0.5 rounded-full hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          {connLoading === i ? '…' : '+ Connect'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick links */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Quick Links</h3>
              <nav className="space-y-1">
                {[
                  { icon: '&#127970;', label: 'Browse Jobs', path: '/jobs' },
                  { icon: '&#129309;', label: 'My Connections', path: '/people' },
                  { icon: '&#127760;', label: 'Network Graph', path: '/network-graph' },
                  { icon: '&#9881;',   label: 'Settings', path: '/settings' },
                ].map(l => (
                  <button key={l.path} onClick={() => navigate(l.path)}
                    className="w-full flex items-center gap-3 px-2 py-1.5 text-sm text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <span dangerouslySetInnerHTML={{ __html: l.icon }} />
                    <span>{l.label}</span>
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* ────────────────── MAIN FEED ────────────────── */}
          <div className="space-y-4 min-w-0">

            {/* Post composer */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex gap-3 items-center">
                <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${GRAD(profile.username)} flex items-center justify-center text-white font-bold text-lg shrink-0 overflow-hidden`}>
                  {profile.profile_picture_url
                    ? <img src={profile.profile_picture_url} className="w-full h-full object-cover" alt="" />
                    : profile.username[0].toUpperCase()}
                </div>
                {!showComposer ? (
                  <button
                    onClick={() => setShowComposer(true)}
                    className="flex-1 text-left px-4 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-full text-sm text-gray-400 transition"
                  >
                    What's on your mind, {firstName}?
                  </button>
                ) : (
                  <div className="flex-1">
                    <textarea
                      autoFocus
                      value={newPost}
                      onChange={e => setNewPost(e.target.value)}
                      placeholder={`What's on your mind, ${firstName}?`}
                      rows={3}
                      className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2 mt-2 justify-end">
                      <button onClick={() => { setShowComposer(false); setNewPost(''); }}
                        className="px-4 py-1.5 text-sm text-gray-500 hover:text-gray-700">
                        Cancel
                      </button>
                      <button
                        onClick={handlePost as any}
                        disabled={!newPost.trim() || posting}
                        className="px-5 py-1.5 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-40"
                      >
                        {posting ? 'Posting…' : 'Post'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Feed posts */}
            {feed.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 py-20 text-center text-gray-400">
                <div className="text-5xl mb-4">&#128240;</div>
                <p className="font-semibold text-lg">Your feed is empty</p>
                <p className="text-sm mt-1 mb-5">Connect with people to see their posts here</p>
                <button onClick={() => navigate('/people')}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition">
                  Find people to connect
                </button>
              </div>
            ) : (
              feed.map(post => (
                <div key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${GRAD(post.author_username)} flex items-center justify-center text-white font-bold shrink-0 overflow-hidden`}>
                      {post.author_profile_picture_url
                        ? <img src={post.author_profile_picture_url} className="w-full h-full object-cover" alt="Profile" />
                        : post.author_username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
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

        </div>
      </div>


    </div>
  );
}