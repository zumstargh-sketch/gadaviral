import { useEffect, useState } from 'react';
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.js';
import { apiUrl } from '../api.js';

/** Live profile counter (including seeded community members) from /stats. */
function MemberCount() {
  const [stats, setStats] = useState<{ totalProfiles: number } | null>(null);
  useEffect(() => {
    fetch(apiUrl('stats'))
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (s && s.totalProfiles) setStats(s); })
      .catch(() => { /* decorative */ });
  }, []);
  if (!stats) return null;
  return (
    <p style={{ marginTop: 8 }}>
      🧑‍🤝‍🧑 <b>{stats.totalProfiles}</b> members
    </p>
  );
}

// Real-time (Socket.IO) is not available on the WordPress backend. `socket`
// stays null, so the live listeners (Messages live-append, notification toast)
// no-op gracefully instead of hammering the API with failing socket requests.
// Affected features (documented in the migration report):
//   • instant "notification" toasts in Layout
//   • instant message append in Messages
// Both still work via normal REST loads / on-demand refreshes.
export let socket: any = null;

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  const navItems = [
    { to: '/feed', label: 'Feed', icon: '🏠' },
    { to: '/explore', label: 'Explore', icon: '🔍' },
    { to: '/notifications', label: 'Alerts', icon: '🔔' },
    { to: '/messages', label: 'Messages', icon: '✉️' },
    { to: `/u/${user?.username}`, label: 'Profile', icon: '👤' },
  ];

  return (
    <div className="app">
      <aside className="sidebar">
        <Link to="/feed" className="brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />GADAVIRAL</Link>
        {[...navItems,
          { to: '/groups', label: 'Groups', icon: '👥' },
          { to: '/events', label: 'Events', icon: '📅' },
          { to: '/businesses', label: 'Businesses', icon: '🛍️' },
          { to: '/settings', label: 'Settings', icon: '⚙️' },
          ...(['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user?.role) ? [{ to: '/admin', label: 'Admin', icon: '🛡️' }] : []),
        ].map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
            <span>{item.icon}</span> {item.label}
          </NavLink>
        ))}
        <button className="ghost" style={{ marginTop: 12 }} onClick={async () => { await logout(); nav('/login'); }}>
          Log out
        </button>
      </aside>

      <main className="main"><Outlet /></main>

      <aside className="rightbar">
        <div className="card">
          <b style={{ color: 'var(--gold)' }}>{user?.full_name}</b>
          <div className="muted">@{user?.username}</div>
          {user && !user.email_verified && (
            <div style={{ marginTop: 8 }}>
              <span className="badge">email unverified</span><br />
              <Link to="/verify" className="small" style={{ fontSize: 13 }}>Verify now →</Link>
            </div>
          )}
        </div>
        <div className="card muted">
          <b style={{ color: 'var(--text)' }}>Dangme & Ga Online Social Community</b>
          <p>Connect · Share · Build Together</p>
          <MemberCount />
        </div>
      </aside>

      <nav className="bottomnav">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span style={{ fontSize: 18 }}>{item.icon}</span>{item.label}
          </NavLink>
        ))}
      </nav>

      {toast && <div className="toast">🔔 {toast}</div>}
    </div>
  );
}
