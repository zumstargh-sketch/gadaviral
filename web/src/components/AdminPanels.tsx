import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';

export function ModerationPanel() {
  const [data, setData] = useState<any>({});
  const load = async () => {
    const q = await api.get('/moderation/queue');
    setData({ reports: q.items, flagged: q.flaggedPosts });
  };
  useEffect(() => { load(); }, []);

  const handleReport = async (id: string, action: string, removeTarget: boolean) => {
    await api.post(`/moderation/reports/${id}/handle`, { action, removeTarget, note: 'dashboard' });
    load();
  };
  const modPost = async (id: string, action: 'remove' | 'restore') => {
    await api.post(`/moderation/posts/${id}/${action}`, {});
    load();
  };

  return (
    <>
      <div className="card">
        <b>Report queue ({(data.reports ?? []).length})</b>
        {(data.reports ?? []).map((r: any) => (
          <div key={r.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <div className="row spread">
              <span><span className="badge gold">{r.category}</span> {r.target_type}
                <span className="muted"> · by @{r.reporter_username}</span></span>
              <span className="row">
                <button className="small ghost" onClick={() => handleReport(r.id, 'REVIEWING', false)}>Review</button>
                <button className="small danger" onClick={() => handleReport(r.id, 'RESOLVED', true)}>Resolve + remove</button>
                <button className="small ghost" onClick={() => handleReport(r.id, 'DISMISSED', false)}>Dismiss</button>
              </span>
            </div>
            {r.details && <div className="muted">"{r.details}"</div>}
          </div>
        ))}
        {(data.reports ?? []).length === 0 && <p className="muted">Queue is clear 🎉</p>}
      </div>
      <div className="card">
        <b>Flagged content (pending review)</b>
        {(data.flagged ?? []).map((p: any) => (
          <div key={p.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <b>@{p.author_username}</b> <span className="muted">{new Date(p.created_at).toLocaleString()}</span>
            <div>{p.content}</div>
            <button className="small danger" style={{ marginTop: 6 }} onClick={() => modPost(p.id, 'remove')}>Remove post</button>
            <button className="small ghost" style={{ marginLeft: 8 }} onClick={() => modPost(p.id, 'restore')}>Approve</button>
          </div>
        ))}
        {(data.flagged ?? []).length === 0 && <p className="muted">Nothing flagged.</p>}
      </div>
    </>
  );
}

export function AuditPanel() {
  const [logs, setLogs] = useState<any[]>([]);
  useEffect(() => { api.get('/admin/audit-logs?limit=50').then((d) => setLogs(d.items)); }, []);
  return (
    <div className="card">
      <b>Audit log</b>
      <table>
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th></tr></thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <td className="muted">{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.actor_username ?? 'system'}</td>
              <td><span className="badge">{l.action}</span></td>
              <td className="muted">{l.entity_type} {l.entity_id?.slice(0, 8)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
