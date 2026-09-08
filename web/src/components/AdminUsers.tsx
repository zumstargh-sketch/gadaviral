import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { ModerationPanel, AuditPanel } from '../components/AdminPanels.js';

export function DemoPanel() {
  const [demo, setDemo] = useState<any>(null);
  const [verify, setVerify] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const load = async () => {
    setDemo(await api.get('/admin/demo/stats'));
    setVerify(await api.get('/admin/demo/verify'));
  };
  useEffect(() => { load(); }, []);

  const reseed = async () => {
    if (!confirm('REGENERATE demo data? The current demo dataset is wiped and re-created (real users untouched).')) return;
    setMsg('Regenerating… (up to a minute)');
    try {
      const res = await api.post('/admin/demo/seed', { force: true });
      setMsg(`✔ Regenerated: ${res.report.users} users, ${res.report.posts} posts`);
      load();
    } catch (e: any) { setMsg('✗ ' + e.message); }
  };
  const wipe = async () => {
    if (!confirm('DELETE ALL DEMO DATA? Removes every demo user, post, comment, reaction, share, view, follow and notification. Genuine users are NEVER touched.')) return;
    try {
      const res = await api.post('/admin/demo/wipe', {});
      const total = Object.values(res.counts).reduce((a: any, b: any) => a + Number(b), 0);
      setMsg(`✔ Demo data deleted — ${total} rows removed`);
      load();
    } catch (e: any) { setMsg('✗ ' + e.message); }
  };

  return (
    <>
      {msg && <div className="card">{msg}</div>}
      {demo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[['Demo users', demo.users], ['Demo posts', demo.posts],
            ['Comments', demo.comments], ['Reactions', demo.reactions],
            ['Shares', demo.shares], ['Views', demo.views],
            ['Follows', demo.follows], ['Notifications', demo.notifications]].map(([l, v]) => (
            <div className="stat" key={l as string}><b>{String(v)}</b><span className="muted">{l}</span></div>
          ))}
        </div>
      )}
      {demo?.batches?.length > 0 && (
        <div className="card">
          <b>Seed batches</b>
          {demo.batches.map((b: any) => (
            <div key={b.batch} className="muted" style={{ padding: '4px 0' }}>
              {b.batch.slice(0, 8)}… started {new Date(b.started_at).toLocaleString()}
              {b.wiped_at ? ` · wiped ${new Date(b.wiped_at).toLocaleString()}` : ' · ACTIVE'}
            </div>
          ))}
        </div>
      )}
      {verify && (
        <div className="card">
          <b>Validation (§98)</b>
          {verify.issues.map((i: any) => (
            <div key={i.check} style={{ color: i.ok ? 'var(--ok)' : 'var(--danger)' }}>
              {i.ok ? '✔' : '✗'} {i.check} — {i.detail}
            </div>
          ))}
        </div>
      )}
      <div className="card" style={{ borderColor: 'var(--danger)' }}>
        <b style={{ color: 'var(--danger)' }}>Demo data management</b>
        <p className="muted">Demo data is fully tagged and can be removed without affecting genuine users.</p>
        <div className="row wrap">
          <button className="blue" onClick={reseed}>♻️ REGENERATE DEMO DATA</button>
          <button className="danger" onClick={wipe}>🗑️ DELETE ALL DEMO DATA</button>
        </div>
      </div>
    </>
  );
}

export function UsersPanel({ q, setQ }: { q: string; setQ: (s: string) => void }) {
  const [users, setUsers] = useState<any[]>([]);
  const load = useCallback(async () => {
    setUsers((await api.get(`/admin/users?q=${encodeURIComponent(q)}&limit=30`)).items);
  }, [q]);
  useEffect(() => { load(); }, [q]);

  const setStatus = async (id: string, status: string) => {
    const reason = status === 'ACTIVE' ? undefined : prompt(`Reason for ${status.toLowerCase()}:`) ?? undefined;
    await api.post(`/admin/users/${id}/status`, { status, reason });
    load();
  };

  return (
    <div className="card">
      <input placeholder="Search name, username, email…" value={q} onChange={(e) => setQ(e.target.value)} />
      <table style={{ marginTop: 10 }}>
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><b>{u.full_name}</b> {u.is_demo && <span className="badge demo">DEMO</span>}<br />
                <span className="muted">@{u.username} · {u.email}</span></td>
              <td>{u.role}</td>
              <td><span className="badge" style={u.status !== 'ACTIVE' ? { color: 'var(--danger)' } : {}}>{u.status}</span></td>
              <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
              <td>
                <div className="row wrap">
                  {u.status === 'ACTIVE'
                    ? <button className="small ghost" onClick={() => setStatus(u.id, 'SUSPENDED')}>Suspend</button>
                    : <button className="small ghost" onClick={() => setStatus(u.id, 'ACTIVE')}>Restore</button>}
                  {u.status !== 'BANNED' && <button className="small danger" onClick={() => setStatus(u.id, 'BANNED')}>Ban</button>}
                  {!u.email_verified && (
                    <button className="small ghost" onClick={async () => { await api.post(`/admin/users/${u.id}/verify`, {}); load(); }}>
                      Verify
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
