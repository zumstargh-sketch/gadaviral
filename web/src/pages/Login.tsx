import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { GoogleButton } from '../components/ui.js';
import CommunityStrip from '../components/CommunityStrip.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { refresh } = useAuth();

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      api.setTokens(res.accessToken, res.refreshToken);
      await refresh();
      nav(loc.state?.from ?? '/feed');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="card">
        <img className="auth-logo" src={`${import.meta.env.BASE_URL}icons/logo-512.png`} alt="GADAVIRAL logo" />
        <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--gold)', textAlign: 'center', marginBottom: 18 }}>
          GADAVIRAL
        </div>
        <form onSubmit={submit}>
          <input placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
            style={{ marginTop: 10 }} />
          {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
          <button className="primary" style={{ width: '100%', marginTop: 14 }} disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
        </form>
        <div className="or">— or —</div>
        <GoogleButton />
        <div className="row spread" style={{ marginTop: 16, fontSize: 14 }}>
          <Link to="/register">Create account</Link>
          <Link to="/reset-password">Forgot password?</Link>
        </div>
      </div>
      <CommunityStrip />
      <div className="made-by">Made by <span>DATILA Solutions</span></div>
    </div>
  );
}
