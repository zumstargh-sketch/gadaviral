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

/** ☰ hamburger — opens the full sidebar on phones. */
function Hamburger({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button className={'hamburger' + (open ? ' on' : '')} onClick={onClick} aria-label="Menu">
      <span /><span /><span />
    </button>
  );
}

/** Short notification ding (phone-style) via Web Audio — instant, no files. */
function playDing() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine';
    o.frequency.setValueAtTime(880, ctx.currentTime);
    g.gain.setValueAtTime(0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55);
    o.start();
    o.stop(ctx.currentTime + 0.6);
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 900);
  } catch { /* audio blocked — silent */ }
}

/** Instant notification poller: browser notification (with the device's
 *  default notification sound) + in-app toast + unread badge in the title. */
function useInstantNotifications(user: any, setToast: (s: string) => void) {
  const lastSeen = { current: null as string | null };
  useEffect(() => {
    if (!user) return;
    const askPermission = () => {
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { /* ignore */ });
      }
    };
    document.addEventListener('click', askPermission, { once: true });

    const poll = async () => {
      try {
        const d = await api.get('/notifications');
        const items: any[] = d.items ?? [];
        const newest = items[0];
        if (newest) {
          const isNew = !lastSeen.current || newest.created_at > lastSeen.current;
          if (isNew && lastSeen.current) {
            playDing();
            const text = newest.body || 'You have a new notification';
            setToast('🔔 ' + text);
            if ('Notification' in window && Notification.permission === 'granted') {
              try {
                const n = new Notification('GADAVIRAL', {
                  body: text,
                  icon: `${import.meta.env.BASE_URL}icons/icon-192.png`,
                  tag: 'gadv-' + newest.id,
                });
                setTimeout(() => { try { n.close(); } catch { /* ignore */ } }, 8000);
              } catch { /* ignore */ }
            }
          }
          lastSeen.current = newest.created_at;
        }
        const unread = d.unreadCount ?? 0;
        document.title = unread > 0 ? `(${unread}) GADAVIRAL` : 'GADAVIRAL';
      } catch { /* session may be refreshing — next tick retries */ }
    };

    poll();
    const t = setInterval(poll, 20000);
    return () => { clearInterval(t); document.removeEventListener('click', askPermission); document.title = 'GADAVIRAL'; };
  }, [user?.id]);
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
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);
  useInstantNotifications(user, (s) => setToast(s));

  const navItems = [
    { to: '/feed', label: 'Feed', icon: '🏠' },
    { to: '/explore', label: 'Explore', icon: '🔍' },
    { to: '/notifications', label: 'Alerts', icon: '🔔' },
    { to: '/messages', label: 'Messages', icon: '✉️' },
    { to: `/u/${user?.username}`, label: 'Profile', icon: '👤' },
  ];

  return (
    <div className="app">
      <Hamburger open={menuOpen} onClick={() => setMenuOpen((v) => !v)} />
      <div className={'backdrop' + (menuOpen ? ' show' : '')} onClick={closeMenu} />
      <aside className={'sidebar' + (menuOpen ? ' open' : '')}>
        <Link to="/feed" className="brand" onClick={closeMenu}><img className="brand-mark" src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />GADAVIRAL</Link>
        {[...navItems,
          { to: '/groups', label: 'Groups', icon: '👥' },
          { to: '/events', label: 'Events', icon: '📅' },
          { to: '/businesses', label: 'Businesses', icon: '🛍️' },
          { to: '/settings', label: 'Settings', icon: '⚙️' },
          ...(['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user?.role) ? [{ to: '/admin', label: 'Admin', icon: '🛡️' }] : []),
        ].map((item) => (
          <NavLink key={item.to} to={item.to} onClick={closeMenu} className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}>
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
