import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { GoogleButton } from '../components/ui.js';
import CommunityStrip from '../components/CommunityStrip.js';

export default function Register() {
  const [form, setForm] = useState({ fullName: '', email: '', password: '', username: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const body: any = { ...form };
      if (!body.username) delete body.username;
      const res = await api.post('/auth/register', body);
      setDone(true);
      setTimeout(() => nav(`/verify?email=${encodeURIComponent(form.email)}`), 1500);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <div className="auth-wrap">
        <div className="card" style={{ textAlign: 'center' }}>
          <h2>Welcome to GADAVIRAL! 🎉</h2>
          <p className="muted">We sent a verification email with a link and a 6-digit code.<br />Taking you to verification…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        <img className="auth-logo" src="/icons/logo-512.png" alt="GADAVIRAL logo" />
        <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold)', textAlign: 'center', marginBottom: 14 }}>
          GADA<span style={{ color: '#fff' }}>VIRAL</span>
        </div>
        <form onSubmit={submit}>
          <input placeholder="Full name (e.g. Nii Tetteh Quaye)" value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          <input placeholder="Email address" type="email" value={form.email} style={{ marginTop: 10 }}
            onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input placeholder="Password (min 8 characters)" type="password" value={form.password} style={{ marginTop: 10 }}
            onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
          <input placeholder="Username (optional — we suggest one)" value={form.username} style={{ marginTop: 10 }}
            onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
            pattern="[a-z0-9_]{3,30}" title="3-30 chars: a-z, 0-9, underscore" />
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          <button className="primary" style={{ width: '100%', marginTop: 14 }} disabled={busy}>
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
        <div className="or">— or —</div>
        <GoogleButton label="Sign up with Google" />
        <p className="muted" style={{ marginTop: 14, textAlign: 'center' }}>
          Already a member? <Link to="/login">Log in</Link>
        </p>
      </div>
      <CommunityStrip />
      <div className="made-by">Made by <span>DATILA Solutions</span></div>
    </div>
  );
}
