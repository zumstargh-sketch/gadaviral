import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [requestEmail, setRequestEmail] = useState('');
  const [requested, setRequested] = useState(false);
  const nav = useNavigate();
  const token = params.get('token');

  const submit = async (e: any) => {
    e.preventDefault(); setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => nav('/login'), 2200);
    } catch (err: any) { setError(err.message); }
  };

  const request = async (e: any) => {
    e.preventDefault(); setError('');
    try {
      await api.post('/auth/forgot-password', { email: requestEmail });
      setRequested(true);
    } catch (err: any) { setError(err.message); }
  };

  return (
    <div className="auth-wrap">
      <div className="card">
        {token ? (
          done ? (
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ color: 'var(--ok)' }}>Password updated ✔</h2>
              <p className="muted">Redirecting to login…</p>
            </div>
          ) : (
            <>
              <h2>Choose a new password</h2>
              <form onSubmit={submit}>
                <input type="password" placeholder="New password (min 8 characters)" value={password}
                  onChange={(e) => setPassword(e.target.value)} required minLength={8} />
                {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
                <button className="primary" style={{ width: '100%', marginTop: 14 }}>Reset password</button>
              </form>
            </>
          )
        ) : requested ? (
          <div style={{ textAlign: 'center' }}>
            <h2>Check your inbox 📧</h2>
            <p className="muted">If that account exists, a reset link from GADAVIRAL (admin@gadaviral.com) is on its way.</p>
          </div>
        ) : (
          <>
            <h2>Forgot password?</h2>
            <p className="muted">Enter your email and we'll send a secure reset link.</p>
            <form onSubmit={request}>
              <input type="email" placeholder="Email address" value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)} required />
              {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
              <button className="primary" style={{ width: '100%', marginTop: 14 }}>Send reset link</button>
            </form>
          </>
        )}
        <p style={{ textAlign: 'center', marginTop: 16 }}><Link to="/login">← Back to login</Link></p>
      </div>
    </div>
  );
}
