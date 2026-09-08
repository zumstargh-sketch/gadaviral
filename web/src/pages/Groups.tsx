import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

export default function Groups() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    const d = await api.get(`/groups?q=${encodeURIComponent(q)}&limit=30`);
    setItems(d.items);
  }, [q]);
  useEffect(() => { load(); }, [q]);

  const join = async (slug: string, joined: boolean) => {
    if (joined) await api.post(`/groups/${slug}/leave`, {});
    else await api.post(`/groups/${slug}/join`, {});
    load();
  };

  const create = async () => {
    try {
      await api.post('/groups', { name, description });
      setShowCreate(false); setName(''); setDescription('');
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="row">
        <input placeholder="Search groups…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="primary" onClick={() => setShowCreate(!showCreate)}>+ Create</button>
      </div>
      {showCreate && (
        <div className="card" style={{ marginTop: 12 }}>
          <input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8 }} />
          <textarea placeholder="What is this group about?" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginBottom: 8 }} />
          <button className="primary" onClick={create} disabled={name.length < 3}>Create group</button>
        </div>
      )}
      <div className="grid2" style={{ marginTop: 14 }}>
        {items.map((g) => (
          <div className="card" key={g.id}>
            <Link to={`/groups/${g.slug}`} style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{g.name}</Link>
            {g.is_demo && <> <span className="badge demo">DEMO</span></>}
            <div className="muted">{g.description}</div>
            <div className="row spread" style={{ marginTop: 10 }}>
              <span className="badge">{g.member_count} members · {g.privacy}</span>
              <button className={g.joined ? 'ghost' : 'blue'} onClick={() => join(g.slug, g.joined)}>
                {g.joined ? 'Joined ✓' : 'Join'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
