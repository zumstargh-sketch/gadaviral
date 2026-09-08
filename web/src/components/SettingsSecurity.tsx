import { useState, useEffect } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

export function SettingsSecurity() {
  const { user } = useAuth();
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [emailChange, setEmailChange] = useState({ newEmail: '', currentPassword: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const changePassword = async () => {
    setErr(''); setMsg('');
    try {
      const res = await api.post('/auth/change-password', passwords);
      setMsg(res.message + ' — please log in again.');
      api.setTokens(null, null);
    } catch (e: any) { setErr(e.message); }
  };
  const changeEmail = async () => {
    setErr(''); setMsg('');
    try {
      const res = await api.post('/auth/change-email', emailChange);
      setMsg(res.message);
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <>
      {msg && <div className="card success">{msg}</div>}
      {err && <div className="card error">{err}</div>}
      <div className="card">
        <b>Change password</b>
        <input type="password" placeholder="Current password" value={passwords.currentPassword}
          onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} style={{ marginTop: 10 }} />
        <input type="password" placeholder="New password (min 8)" value={passwords.newPassword}
          onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} style={{ marginTop: 10 }} />
        <button className="primary" style={{ marginTop: 10 }} onClick={changePassword}
          disabled={!passwords.currentPassword || passwords.newPassword.length < 8}>Update password</button>
      </div>
      <div className="card">
        <b>Change email</b>
        <p className="muted">Current: {user?.email} — we'll send a confirmation to the new address.</p>
        <input type="email" placeholder="New email" value={emailChange.newEmail}
          onChange={(e) => setEmailChange({ ...emailChange, newEmail: e.target.value })} />
        <input type="password" placeholder="Current password" value={emailChange.currentPassword}
          onChange={(e) => setEmailChange({ ...emailChange, currentPassword: e.target.value })} style={{ marginTop: 10 }} />
        <button className="primary" style={{ marginTop: 10 }} onClick={changeEmail}
          disabled={!emailChange.newEmail || !emailChange.currentPassword}>Request email change</button>
      </div>
    </>
  );
}

export function SettingsBlocks() {
  const [blocks, setBlocks] = useState<any[]>([]);
  useEffect(() => { api.get('/users/me/blocks').then((b) => setBlocks(b.items)); }, []);
  const unblock = async (username: string) => {
    await api.del(`/users/${username}/block`);
    setBlocks((b) => b.filter((x) => x.username !== username));
  };
  return (
    <div className="card">
      <b>Blocked users</b>
      {blocks.map((b) => (
        <div key={b.id} className="row spread" style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
          <span>{b.full_name} <span className="muted">@{b.username}</span></span>
          <button className="small ghost" onClick={() => unblock(b.username)}>Unblock</button>
        </div>
      ))}
      {blocks.length === 0 && <p className="muted">You have not blocked anyone.</p>}
    </div>
  );
}

export function SettingsDanger() {
  const deactivate = async () => {
    if (!confirm('Deactivate your account? You will be logged out.')) return;
    await api.post('/users/me/deactivate', {});
    api.setTokens(null, null);
    location.href = '/';
  };
  return (
    <div className="card" style={{ borderColor: 'var(--danger)' }}>
      <b style={{ color: 'var(--danger)' }}>Deactivate account</b>
      <p className="muted">Your profile and posts will be hidden and you will be logged out.</p>
      <button className="danger" onClick={deactivate}>Deactivate my account</button>
    </div>
  );
}
