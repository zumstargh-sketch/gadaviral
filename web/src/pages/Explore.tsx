import { useState } from 'react';
import { api } from '../api.js';
import { Avatar, timeAgo } from '../components/ui.js';
import { Link } from 'react-router-dom';

export default function Explore() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any>(null);
  const [tab, setTab] = useState('all');

  const search = async (e?: any) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setResults(await api.get(`/search?q=${encodeURIComponent(q)}&type=${tab}`));
  };

  return (
    <div>
      <form onSubmit={search} className="row">
        <input placeholder="Search people, posts, groups, businesses, events…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <button className="primary">Search</button>
      </form>

      <div className="tabs" style={{ marginTop: 14 }}>
        {['all', 'users', 'posts', 'groups', 'businesses', 'events'].map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); if (q) setTimeout(search, 0); }}>{t}</button>
        ))}
      </div>

      {!results && <div className="card muted">Search the community — try "Homowo", "kenkey" or a username.</div>}

      {results?.users?.length > 0 && (
        <div className="card">
          <b>People</b>
          {results.users.map((u: any) => (
            <Link key={u.id} to={`/u/${u.username}`} className="row" style={{ padding: '8px 0', color: 'var(--text)' }}>
              <Avatar user={u} size="sm" />
              <div style={{ flex: 1 }}>
                <b>{u.full_name}</b> {u.is_demo && <span className="badge demo">DEMO</span>}
                <div className="muted">@{u.username} · {u.follower_count} followers</div>
              </div>
            </Link>
          ))}
        </div>
      )}
      {results?.posts?.length > 0 && (
        <div className="card">
          <b>Posts</b>
          {results.posts.map((p: any) => (
            <Link key={p.id} to={`/post/${p.id}`} style={{ display: 'block', padding: '8px 0', color: 'var(--text)' }}>
              <b>{p.author_name}</b> <span className="muted">@{p.author_username}</span>
              <div className="muted">{String(p.content).slice(0, 140)}</div>
            </Link>
          ))}
        </div>
      )}
      {results?.groups?.length > 0 && (
        <div className="card"><b>Groups</b>
          {results.groups.map((g: any) => (
            <Link key={g.id} to={`/groups/${g.slug}`} style={{ display: 'block', padding: '6px 0' }}>
              {g.name} <span className="muted">· {g.member_count} members</span>
            </Link>))}
        </div>
      )}
      {results?.businesses?.length > 0 && (
        <div className="card"><b>Businesses</b>
          {results.businesses.map((b: any) => (
            <div key={b.id} style={{ padding: '6px 0' }}>
              {b.verified && <span className="badge gold">verified</span>} <b>{b.name}</b>
              <span className="muted"> · {b.category.toLowerCase()} {b.area ? `· ${b.area}` : ''}</span>
            </div>))}
        </div>
      )}
      {results?.events?.length > 0 && (
        <div className="card"><b>Events</b>
          {results.events.map((e: any) => (
            <div key={e.id} style={{ padding: '6px 0' }}>{e.title} <span className="muted">· {new Date(e.starts_at).toLocaleDateString()}</span></div>))}
        </div>
      )}
      {results && !results.users?.length && !results.posts?.length && !results.groups?.length && !results.businesses?.length && !results.events?.length && (
        <div className="card muted">No results for "{results.query}".</div>
      )}
    </div>
  );
}
