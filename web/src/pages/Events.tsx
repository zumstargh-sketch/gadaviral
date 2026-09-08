import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export default function Events() {
  const [items, setItems] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', location: '', startsAt: '' });

  const load = useCallback(async () => {
    const d = await api.get('/events?limit=30');
    setItems(d.items);
  }, []);
  useEffect(() => { load(); }, []);

  const rsvp = async (slug: string, r: string) => {
    await api.post(`/events/${slug}/rsvp`, { rsvp: r });
    load();
  };

  const create = async () => {
    try {
      await api.post('/events', {
        ...form,
        startsAt: new Date(form.startsAt).toISOString(),
      });
      setShowCreate(false);
      load();
    } catch (e: any) { alert(e.message); }
  };

  return (
    <div>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Community events</h2>
        <button className="primary" onClick={() => setShowCreate(!showCreate)}>+ Create event</button>
      </div>
      {showCreate && (
        <div className="card" style={{ marginTop: 12 }}>
          <input placeholder="Event title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ marginBottom: 8 }} />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ marginBottom: 8 }} />
          <div className="grid2">
            <input placeholder="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          </div>
          <button className="primary" style={{ marginTop: 10 }} onClick={create}
            disabled={!form.title || !form.location || !form.startsAt}>Create</button>
        </div>
      )}
      {items.map((e) => {
        const going = Number(e.going_count);
        const interested = Number(e.interested_count);
        return (
          <div className="card" key={e.id}>
            <div className="row spread wrap">
              <div>
                <b style={{ fontSize: 16 }}>{e.title}</b>
                {e.seed_note && <> <span className="badge demo">DEMO/SEED — fictional</span></>}
                <div className="muted">
                  📅 {new Date(e.starts_at).toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' })} · 📍 {e.location}
                  {e.community ? ` · ${e.community}` : ''}
                </div>
                {e.description && <p style={{ marginBottom: 0 }}>{e.description}</p>}
                <div className="muted" style={{ marginTop: 6 }}>{going} going · {interested} interested</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className={e.my_rsvp === 'GOING' ? 'primary' : 'ghost'} onClick={() => rsvp(e.slug, 'GOING')}>✓ Going</button>
                <button className={e.my_rsvp === 'INTERESTED' ? 'blue' : 'ghost'} onClick={() => rsvp(e.slug, 'INTERESTED')}>★ Interested</button>
                {(e.my_rsvp) && <button className="ghost" onClick={() => rsvp(e.slug, 'NONE')}>Cancel</button>}
              </div>
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div className="card muted">No upcoming events.</div>}
    </div>
  );
}
