import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  getPublicProfile,
  getMyProfile,
  sendConnectionRequest,
  respondToConnection,
  removeConnection,
} from '../services/api';

// ── Helpers ──────────────────────────────────────────────────────────────

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

// ── Component ─────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();

  const [myProfile, setMyProfile] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!username) return;
    const load = async () => {
      try {
        const [mine, pub] = await Promise.all([getMyProfile(), getPublicProfile(username)]);
        setMyProfile(mine);
        setProfile(pub);
      } catch (err: any) {
        if (err.message === 'Unauthorized') navigate('/login');
        else setError('Profile not found or unavailable.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [username, navigate]);

  // ── Connection actions ────────────────────────────────────────────────

  const handleConnect = async () => {
    setActionLoading(true);
    try {
      const r = await sendConnectionRequest(username!);
      setProfile((p: any) => ({ ...p, connection_status: 'pending_sent', connection_id: r.id }));
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleRespond = async (action: 'ACCEPT' | 'REJECT') => {
    setActionLoading(true);
    try {
      await respondToConnection(profile.connection_id, action);
      setProfile((p: any) => ({
        ...p,
        connection_status: action === 'ACCEPT' ? 'connected' : 'none',
        connection_id: action === 'ACCEPT' ? p.connection_id : null,
      }));
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  const handleRemove = async () => {
    if (!confirm('Remove this connection?')) return;
    setActionLoading(true);
    try {
      await removeConnection(profile.connection_id);
      setProfile((p: any) => ({ ...p, connection_status: 'none', connection_id: null }));
    } catch (e: any) { alert(e.message); }
    finally { setActionLoading(false); }
  };

  // ── Render: Loading / Error ───────────────────────────────────────────

  if (loading) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />
      <div className="flex items-center justify-center h-96 text-gray-400">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
          <p>Loading profile…</p>
        </div>
      </div>
    </div>
  );

  if (error || !profile) return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />
      <div className="flex flex-col items-center justify-center h-96 text-gray-400">
        <div className="text-6xl mb-4">🔍</div>
        <p className="font-medium">{error || 'Profile not found'}</p>
        <button onClick={() => navigate('/people')} className="mt-4 text-blue-600 hover:underline text-sm">
          ← Back to People
        </button>
      </div>
    </div>
  );

  const isOwn = profile.is_own_profile;
  const skills = profile.skills
    ? profile.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
    : [];

  // ── Render: Full Profile ──────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar role={myProfile?.role} username={myProfile?.username} />

      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Back */}
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mb-6">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* ── Hero Card ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-5">
          {/* Cover */}
          <div className="h-28" style={{ background: 'linear-gradient(135deg, #1e3a5f 0%, #3b82f6 60%, #06b6d4 100%)' }} />

          <div className="px-6 pb-6">
            {/* Avatar */}
            <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${avatarGradient(profile.username)} flex items-center justify-center text-white font-bold text-3xl shadow-lg -mt-10 mb-4 border-4 border-white`}>
              {profile.username[0].toUpperCase()}
            </div>

            {/* Name row */}
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{profile.username}</h1>
                {profile.headline && <p className="text-gray-600 mt-1">{profile.headline}</p>}
                {profile.location && (
                  <p className="text-gray-400 text-sm mt-0.5 flex items-center gap-1">
                    <span>📍</span> {profile.location}
                  </p>
                )}
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${roleBadge(profile.role)} mt-2`}>
                  {profile.role}
                </span>
              </div>

              {/* Connection actions */}
              {!isOwn && (
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  {profile.connection_status === 'none' && (
                    <button onClick={handleConnect} disabled={actionLoading}
                      className="px-5 py-2 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-50">
                      {actionLoading ? 'Sending…' : '+ Connect'}
                    </button>
                  )}
                  {profile.connection_status === 'pending_sent' && (
                    <span className="px-5 py-2 bg-gray-100 text-gray-400 rounded-xl text-sm">Request Pending…</span>
                  )}
                  {profile.connection_status === 'pending_received' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleRespond('ACCEPT')} disabled={actionLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50">
                        Accept
                      </button>
                      <button onClick={() => handleRespond('REJECT')} disabled={actionLoading}
                        className="px-4 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-200 transition disabled:opacity-50">
                        Decline
                      </button>
                    </div>
                  )}
                  {profile.connection_status === 'connected' && (
                    <div className="flex items-center gap-2">
                      <span className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-semibold border border-emerald-200">
                        ✓ Connected
                      </span>
                      <button onClick={handleRemove} disabled={actionLoading}
                        className="px-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-sm hover:bg-red-50 hover:text-red-600 transition disabled:opacity-50">
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Own profile — view count */}
              {isOwn && profile.view_count > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{profile.view_count}</p>
                  <p className="text-xs text-blue-500">profile views</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── About / Skills / Experience / Education ──────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {profile.bio && (
            <div className="md:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">About</h2>
              <p className="text-gray-700 text-sm leading-relaxed">{profile.bio}</p>
            </div>
          )}

          {skills.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Skills</h2>
              <div className="flex flex-wrap gap-2">
                {skills.map((s: string, i: number) => (
                  <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded-full text-xs font-medium">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {profile.experience && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Experience</h2>
              <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{profile.experience}</p>
            </div>
          )}

          {profile.education && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Education</h2>
              <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{profile.education}</p>
            </div>
          )}
        </div>

        {/* No info fallback */}
        {!profile.bio && skills.length === 0 && !profile.experience && !profile.education && (
          <div className="text-center py-12 text-gray-400">
            <div className="text-5xl mb-3">🔒</div>
            <p className="text-sm">
              {isOwn
                ? 'Your profile is empty — edit it from the Dashboard!'
                : 'This user hasn\'t shared any public information yet.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
