import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

const CATEGORIES = ['', 'RESTAURANT', 'FASHION', 'FOOD_VENDOR', 'EVENT_SERVICES', 'PHOTOGRAPHY',
  'TRANSPORT', 'PROFESSIONAL', 'ARTISAN', 'TOURISM', 'CATERING', 'DIGITAL', 'LOCAL_SHOP'];

export default function Businesses() {
  const [items, setItems] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'RESTAURANT', description: '', area: '', phone: '' });

  const load = useCallback(async () => {
    const d = await api.get(`/businesses?q=${encodeURIComponent(q)}&category=${category}&limit=30`);
    setItems(d.items);
  }, [q, category]);
  useEffect(() => { load(); }, [q, category]);

  const add = async () => {
    try {
      await api.post('/businesses', form);
      setShowAdd(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="row spread wrap">
        <h2 style={{ margin: 0 }}>Business directory 🛍️</h2>
        <button className="primary" onClick={() => setShowAdd(!showAdd)}>+ Add business</button>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <input placeholder="Search businesses…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select style={{ width: 200 }} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c ? c.replaceAll('_', ' ') : 'All categories'}</option>)}
        </select>
      </div>
      {showAdd && (
        <div className="card" style={{ marginTop: 12 }}>
          <input placeholder="Business name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ marginBottom: 8 }} />
          <div className="grid2">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.slice(1).map((c) => <option key={c}>{c}</option>)}
            </select>
            <input placeholder="Area (e.g. Osu, Somanya)" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} />
          </div>
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ margin: '8px 0' }} />
          <textarea placeholder="Describe the business…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginBottom: 8 }} />
          <button className="primary" onClick={add} disabled={form.name.length < 2}>Submit listing</button>
        </div>
      )}
      <div className="grid2" style={{ marginTop: 14 }}>
        {items.map((b) => (
          <div className="card" key={b.id}>
            <div className="row spread">
              <b style={{ fontSize: 16 }}>{b.name}</b>
              {b.verified && <span className="badge gold">✔ verified</span>}
              {b.is_demo && <span className="badge demo">DEMO</span>}
            </div>
            <div className="muted">{b.category.replaceAll('_', ' ')}{b.area ? ` · ${b.area}` : ''}</div>
            <p style={{ marginBottom: 8 }}>{b.description}</p>
            {b.phone && <div>📞 {b.phone}</div>}
          </div>
        ))}
      </div>
      {items.length === 0 && <div className="card muted">No businesses found.</div>}
    </div>
  );
}
