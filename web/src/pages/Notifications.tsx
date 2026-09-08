import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar, timeAgo } from '../components/ui.js';

export default function Notifications() {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);

  const load = async () => {
    const d = await api.get('/notifications?limit=50');
    setItems(d.items);
    setUnread(d.unreadCount);
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => { await api.post('/notifications/read', {}); load(); };

  const icon: Record<string, string> = {
    REACTION: '💚', COMMENT: '💬', REPLY: '↩️', SHARE: '🔁',
    FOLLOW: '👤', MESSAGE: '✉️', EVENT: '📅', GROUP: '👥', MODERATION: '🛡️', SYSTEM: '📣',
  };

  return (
    <div className="card">
      <div className="row spread">
        <b>Notifications {unread > 0 && <span className="badge gold">{unread} new</span>}</b>
        <button className="small ghost" onClick={markAll}>Mark all read</button>
      </div>
      {items.map((n) => (
        <div key={n.id} className="row" style={{
          padding: '10px 0', borderBottom: '1px solid var(--line)',
          background: n.read_at ? undefined : 'rgba(242,169,0,.05)',
        }}>
          {n.actor_username
            ? <Link to={`/u/${n.actor_username}`}><Avatar user={{ avatar_url: n.actor_avatar, full_name: n.actor_name }} size="sm" /></Link>
            : <div className="avatar sm" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>🛡️</div>}
          <div style={{ flex: 1 }}>
            {n.type === 'FOLLOW' ? (
              <span><Link to={`/u/${n.actor_username}`}>{n.actor_name}</Link> started following you</span>
            ) : n.entity_type === 'post' && n.entity_id ? (
              <span>{n.actor_name} {n.type === 'REACTION' ? 'reacted to' : n.type === 'SHARE' ? 'shared' : 'commented on'} your post
                {n.body ? `: "${String(n.body).slice(0, 60)}"` : ''} — <Link to={`/post/${n.entity_id}`}>view</Link></span>
            ) : (
              <span>{icon[n.type]} {n.body ?? n.type}</span>
            )}
            <div className="muted">{timeAgo(n.created_at)} ago</div>
          </div>
        </div>
      ))}
      {items.length === 0 && <p className="muted">No notifications yet.</p>}
    </div>
  );
}
