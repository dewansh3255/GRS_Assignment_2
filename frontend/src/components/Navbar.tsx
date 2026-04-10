import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getNotifications, markNotificationRead, markAllNotificationsRead,
  respondToConnection,
} from '../services/api';

interface NavbarProps {
  role?: string;
  username?: string;
}

interface Notif {
  id: number;
  notif_type: string;
  message: string;
  sender_username: string | null;
  is_read: boolean;
  created_at: string;
  related_connection_id: number | null;
}

const timeAgo = (iso: string) => {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString();
};

const NOTIF_ICON: Record<string, string> = {
  CONNECTION_REQUEST: '🤝',
  CONNECTION_ACCEPTED: '✅',
  NEW_POST: '📝',
};

export default function Navbar({ role, username }: NavbarProps) {
  const navigate  = useNavigate();
  const location  = useLocation();

  // ── Search ─────────────────────────────────────────────────────────────
  const [searchInput, setSearchInput] = useState('');

  // ── Avatar dropdown ────────────────────────────────────────────────────
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // ── Notification panel ─────────────────────────────────────────────────
  const [showNotifs, setShowNotifs]     = useState(false);
  const [notifs, setNotifs]             = useState<Notif[]>([]);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [respondingId, setRespondingId] = useState<number | null>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // ── Close panels when clicking outside ─────────────────────────────────
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifs(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Poll notifications every 15 s (only when logged-in = username present) ─
  useEffect(() => {
    if (!username) return;
    const fetchNotifs = async () => {
      try {
        const data = await getNotifications();
        setNotifs(data.notifications ?? []);
        setUnreadCount(data.unread_count ?? 0);
      } catch { /* ignore – user may not be logged in yet */ }
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 15000);
    return () => clearInterval(interval);
  }, [username]);

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleLogout = () => {
    localStorage.removeItem('username');
    document.cookie = 'access_token=; Max-Age=0; path=/';
    document.cookie = 'refresh_token=; Max-Age=0; path=/';
    navigate('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      navigate(`/people?q=${encodeURIComponent(searchInput.trim())}`);
      setSearchInput('');
    }
  };

  const handleNotifClick = async (notif: Notif) => {
    if (!notif.is_read) {
      await markNotificationRead(notif.id);
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
    if (notif.sender_username && notif.notif_type !== 'CONNECTION_REQUEST') {
      navigate(`/profile/${notif.sender_username}`);
      setShowNotifs(false);
    }
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead();
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const handleRespond = async (notif: Notif, action: 'ACCEPT' | 'REJECT') => {
    if (!notif.related_connection_id) return;
    setRespondingId(notif.id);
    try {
      await respondToConnection(notif.related_connection_id, action);
      // Remove this notification (no longer actionable) and refresh
      setNotifs(prev => prev.filter(n => n.id !== notif.id));
      setUnreadCount(prev => Math.max(0, prev - (notif.is_read ? 0 : 1)));
    } catch (e: any) { alert(e.message); }
    finally { setRespondingId(null); }
  };

  // ── Nav links ───────────────────────────────────────────────────────────
  const links = [
    { label: 'Home',         path: '/dashboard',   roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'] },
    { label: 'People',       path: '/people',       roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'] },
    { label: 'Jobs',         path: '/jobs',         roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'] },
    { label: 'Applications', path: '/applications', roles: ['CANDIDATE'] },
    { label: 'Post Job',     path: '/recruiter',    roles: ['RECRUITER'] },
    { label: 'Admin',        path: '/admin-panel',  roles: ['ADMIN'] },
    { label: 'My Network',   path: '/network-graph',roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'] },
    { label: '🛡️ Attacks',   path: '/attack-demo',  roles: ['CANDIDATE', 'RECRUITER', 'ADMIN'] },
  ];
  const visible = links.filter(l => !role || l.roles.includes(role));

  const btnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
    border: 'none',
    color: active ? '#fff' : 'rgba(255,255,255,0.72)',
    padding: '6px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    transition: 'all 0.15s',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <>
      <nav style={{
        background: 'linear-gradient(135deg, #1e3a5f 0%, #0f2440 100%)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
        position: 'sticky', top: 0, zIndex: 200,
      }}>
        <div style={{
          maxWidth: 1280, margin: '0 auto', padding: '0 20px',
          display: 'flex', alignItems: 'center', gap: 8, height: 58,
        }}>
          {/* Logo */}
          <div onClick={() => navigate('/dashboard')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'linear-gradient(135deg, #3b82f6, #06b6d4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fff',
            }}>S</div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px', marginRight: 4 }}>
              SecureJobs
            </span>
          </div>

          {/* Nav links */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', flex: 1 }}>
            {visible.map(link => {
              const active = location.pathname === link.path;
              return (
                <button
                  key={link.path}
                  onClick={() => navigate(link.path)}
                  style={btnStyle(active)}
                  onMouseEnter={e => { if (!active) (e.target as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; }}
                  onMouseLeave={e => { if (!active) (e.target as HTMLButtonElement).style.background = 'transparent'; }}
                >
                  {link.label}
                </button>
              );
            })}
          </div>

          {/* Right area: Search | Bell | Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>

            {/* Search */}
            <form onSubmit={handleSearch}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }}>
                  &#128269;
                </span>
                <input
                  id="navbar-search"
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search people..."
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 20, padding: '5px 10px 5px 26px',
                    color: '#fff', fontSize: 12, outline: 'none', width: 140,
                  }}
                  onFocus={e => (e.target.style.background = 'rgba(255,255,255,0.13)')}
                  onBlur={e  => (e.target.style.background = 'rgba(255,255,255,0.08)')}
                />
              </div>
            </form>

            {/* ── Notification Bell ─────────────────────────────────── */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowNotifs(v => !v); setShowDropdown(false); }}
                style={{
                  background: showNotifs ? 'rgba(255,255,255,0.15)' : 'transparent',
                  border: 'none', cursor: 'pointer', position: 'relative',
                  width: 34, height: 34, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => { if (!showNotifs) (e.currentTarget.style.background = 'rgba(255,255,255,0.1)'); }}
                onMouseLeave={e => { if (!showNotifs) (e.currentTarget.style.background = 'transparent'); }}
                title="Notifications"
              >
                <span style={{ fontSize: 16 }}>&#128276;</span>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 4, right: 4,
                    background: '#ef4444', color: '#fff',
                    borderRadius: '50%', width: 15, height: 15,
                    fontSize: 8, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1.5px solid #0f2440',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Panel */}
              {showNotifs && (
                <div style={{
                  position: 'absolute', top: 42, right: 0, width: 360,
                  background: '#fff', borderRadius: 16,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.16)',
                  border: '1px solid #e2e8f0', zIndex: 300,
                  overflow: 'hidden',
                  maxHeight: 480, display: 'flex', flexDirection: 'column',
                }}>
                  {/* Header */}
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={handleMarkAll} style={{ fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                        Mark all read
                      </button>
                    )}
                  </div>

                  {/* Notification list */}
                  <div style={{ overflowY: 'auto' }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                        No notifications yet
                      </div>
                    ) : (
                      notifs.map(n => (
                        <div
                          key={n.id}
                          style={{
                            padding: '12px 16px',
                            background: n.is_read ? '#fff' : '#eff6ff',
                            borderBottom: '1px solid #f8fafc',
                            cursor: n.notif_type !== 'CONNECTION_REQUEST' ? 'pointer' : 'default',
                          }}
                          onClick={() => { if (n.notif_type !== 'CONNECTION_REQUEST') handleNotifClick(n); }}
                        >
                          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            {/* Icon */}
                            <span style={{ fontSize: 20, flexShrink: 0 }}>{NOTIF_ICON[n.notif_type] ?? '🔔'}</span>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 13, color: '#1e293b', margin: 0, lineHeight: 1.4 }}>
                                {n.message}
                              </p>
                              <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{timeAgo(n.created_at)}</p>

                              {/* Inline Accept/Reject for connection requests */}
                              {n.notif_type === 'CONNECTION_REQUEST' && n.related_connection_id && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleRespond(n, 'ACCEPT'); }}
                                    disabled={respondingId === n.id}
                                    style={{
                                      flex: 1, padding: '5px 0', background: '#2563eb', color: '#fff',
                                      border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                      cursor: 'pointer', opacity: respondingId === n.id ? 0.6 : 1,
                                    }}
                                  >
                                    Accept
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleRespond(n, 'REJECT'); }}
                                    disabled={respondingId === n.id}
                                    style={{
                                      flex: 1, padding: '5px 0', background: '#f1f5f9', color: '#475569',
                                      border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                      cursor: 'pointer', opacity: respondingId === n.id ? 0.6 : 1,
                                    }}
                                  >
                                    Ignore
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Unread dot */}
                            {!n.is_read && (
                              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6', flexShrink: 0, marginTop: 4 }} />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Avatar → Dropdown ─────────────────────────────────── */}
            <div ref={dropdownRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowDropdown(v => !v); setShowNotifs(false); }}
                title={username}
                style={{
                  width: 34, height: 34, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  border: showDropdown ? '2px solid rgba(255,255,255,0.7)' : '2px solid rgba(255,255,255,0.25)',
                  color: '#fff', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'border 0.15s',
                }}
              >
                {username ? username[0].toUpperCase() : '?'}
              </button>

              {showDropdown && (
                <div style={{
                  position: 'absolute', top: 42, right: 0, width: 200,
                  background: '#fff', borderRadius: 12,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
                  border: '1px solid #e2e8f0', zIndex: 300, overflow: 'hidden',
                }}>
                  {username && (
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid #f1f5f9' }}>
                      <p style={{ fontWeight: 700, fontSize: 14, color: '#0f172a', margin: 0 }}>{username}</p>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0' }}>{role ?? 'CANDIDATE'}</p>
                    </div>
                  )}

                  {[
                    { icon: '👤', label: 'My Profile',    action: () => navigate('/my-profile') },
                    { icon: '⚙️', label: 'Settings',      action: () => navigate('/settings') },
                    { icon: '🌐', label: 'Network Graph',  action: () => navigate('/network-graph') },
                    { icon: '🛡️', label: 'Attack Demos',   action: () => navigate('/attack-demo') },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={() => { item.action(); setShowDropdown(false); }}
                      style={{
                        width: '100%', padding: '10px 14px', background: 'none',
                        border: 'none', textAlign: 'left', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 13, color: '#374151',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span>{item.icon}</span> {item.label}
                    </button>
                  ))}

                  <div style={{ borderTop: '1px solid #f1f5f9' }}>
                    <button
                      onClick={handleLogout}
                      style={{
                        width: '100%', padding: '10px 14px', background: 'none',
                        border: 'none', textAlign: 'left', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 10,
                        fontSize: 13, color: '#dc2626',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#fef2f2')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <span>&#128682;</span> Logout
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </nav>
    </>
  );
}
