import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth.js';
import { io } from 'socket.io-client';
import { api } from '../api.js';

export let socket: any = null;

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!api.accessToken) return;
    socket = io(api.apiBase || '/', { auth: { token: api.accessToken } });
    socket.on('notification', (n: any) => {
      setToast(n.body ? `${n.type}: ${n.body}` : `New ${n.type.toLowerCase()}`);
      setTimeout(() => setToast(null), 4000);
    });
    return () => { socket?.disconnect(); socket = null; };
  }, [user?.id]);

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
        <Link to="/feed" className="brand"><img className="brand-mark" src="/icons/icon-192.png" alt="" />GADA<span>VIRAL</span></Link>
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
