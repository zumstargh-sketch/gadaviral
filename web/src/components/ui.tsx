import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

export function Avatar({ user, size }: { user: any; size?: 'sm' | 'lg' }) {
  const cls = `avatar ${size ?? ''}`;
  if (user?.avatar_url) return <img className={cls} src={user.avatar_url} alt={user?.full_name} />;
  const initials = (user?.full_name ?? '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className={cls} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--gold)' }}>{initials}</div>;
}

export function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const show = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 3500); };
  const node = msg ? <div className="toast">{msg}</div> : null;
  return { show, node };
}

export function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const nav = useNavigate();
  const { show, node } = useToast();
  return (<>
    <button
      className="ghost"
      style={{ width: '100%', display: 'flex', gap: 10, justifyContent: 'center', alignItems: 'center' }}
      onClick={async () => {
        try {
          const { url } = await api.get('/auth/google/url');
          window.location.href = url;
        } catch (e: any) {
          show(e.message?.toLowerCase().includes('not configured')
            ? 'Google sign-in is not configured on this server yet — WP Admin → Settings → GADAVIRAL Google Sign-in (see docs/GOOGLE-AUTH-SETUP.md).'
            : e.message);
        }
      }}
    >
      <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.1 5.7l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
      {label}
    </button>
    {node}
  </>);
}

export function UserLine({ user }: { user: any }) {
  return (
    <Link to={`/u/${user?.username}`} className="row" style={{ gap: 8 }}>
      <Avatar user={user} size="sm" />
      <div>
        <b>{user?.full_name}</b>{user?.is_demo && <> <span className="badge demo">DEMO</span></>}
        <div className="muted">@{user?.username} · {timeAgo(user?.created_at ?? new Date().toISOString())}</div>
      </div>
    </Link>
  );
}
