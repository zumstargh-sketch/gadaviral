import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { ModerationPanel, AuditPanel } from '../components/AdminPanels.js';
import { DemoPanel, UsersPanel } from '../components/AdminUsers.js';

export default function Admin() {
  const { user } = useAuth();
  const [tab, setTab] = useState('analytics');
  const [analytics, setAnalytics] = useState<any>(null);
  const [userQ, setUserQ] = useState('');
  const isAdmin = ['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(user?.role);

  const loadAnalytics = useCallback(async () => {
    if (isAdmin) setAnalytics(await api.get('/admin/analytics'));
  }, [isAdmin]);
  useEffect(() => { if (tab === 'analytics') loadAnalytics(); }, [tab, loadAnalytics]);

  if (!isAdmin) return <div className="card error">Admin access required.</div>;

  const T = ({ k, children }: any) => (
    <button className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{children}</button>
  );
  const a = analytics;

  return (
    <div>
      <h2>🛡️ Admin Dashboard</h2>
      <div className="tabs">
        <T k="analytics">Analytics</T><T k="users">Users</T>
        <T k="moderation">Moderation</T><T k="demo">Demo data</T><T k="audit">Audit log</T>
      </div>
      {tab === 'analytics' && a && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {[['Users', a.totals.users], ['New (7d)', a.totals.new_users_7d],
            ['Posts', a.totals.posts], ['Comments', a.totals.comments],
            ['Reactions', a.totals.reactions], ['Shares', a.totals.shares],
            ['Views', a.totals.views], ['Active 24h', a.activeLast24h],
            ['Groups', a.totals.groups], ['Events', a.totals.events],
            ['Businesses', a.totals.businesses], ['Messages', a.totals.messages]].map(([l, v]) => (
            <div className="stat" key={l as string}><b>{String(v)}</b><span className="muted">{l}</span></div>
          ))}
        </div>
      )}
      {tab === 'analytics' && !a && <div className="card muted">Loading…</div>}
      {tab === 'users' && <UsersPanel q={userQ} setQ={setUserQ} />}
      {tab === 'moderation' && <ModerationPanel />}
      {tab === 'demo' && <DemoPanel />}
      {tab === 'audit' && <AuditPanel />}
    </div>
  );
}
