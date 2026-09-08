import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

export default function Verify() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const { refresh } = useAuth();
  const timer = useRef<any>(null);

  useEffect(() => {
    timer.current = setInterval(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer.current);
  }, []);

  // Dev mailbox: when the server has no SMTP configured, verification emails
  // land in its outbox instead of being sent. Surface the code so the flow can
  // be completed without a mail server (endpoint self-404s in production).
  useEffect(() => {
    let dead = false;
    if (!email) { setDevCode(null); return; }
    api.get(`/dev/outbox?email=${encodeURIComponent(email)}`)
      .then((res: any) => { if (!dead) setDevCode(res.emails?.find((m: any) => m.otp)?.otp ?? null); })
      .catch(() => { /* not in dev mode — no hint shown */ });
    return () => { dead = true; };
  }, [email, info]);

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.post('/auth/verify-otp', { email, otp });
      await refresh();
      nav('/feed');
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  };

  const resend = async () => {
    setError(''); setInfo('');
    try {
      const res = await api.post('/auth/resend-verification', { email });
      setInfo(res.message);
      setCooldown(60);
    } catch (err: any) { setError(err.message); if (err.message.includes('wait')) setCooldown(60); }
  };

  return (
    <div className="auth-wrap">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Verify your email 📧</h2>
        <p className="muted">
          We sent a 6-digit code from <b>GADAVIRAL (admin@gadaviral.com)</b> —
          enter it below, or use the <b>VERIFY MY EMAIL</b> button in the email.
        </p>
        <input placeholder="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="6-digit code" inputMode="numeric" pattern="\d{6}" maxLength={6}
          value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
          style={{ marginTop: 10, fontSize: 24, letterSpacing: 12, textAlign: 'center' }} />
        {error && <div className="error" style={{ marginTop: 10 }}>{error}</div>}
        {info && <div className="success" style={{ marginTop: 10 }}>{info}</div>}
        {devCode && (
          <div style={{ marginTop: 10, padding: 10, border: '1px dashed var(--gold)', borderRadius: 8 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              Dev mode — SMTP is not configured, so the email was not really sent:
            </div>
            <div className="row" style={{ gap: 10, alignItems: 'center' }}>
              <b style={{ fontSize: 20, letterSpacing: 6 }}>{devCode}</b>
              <button type="button" className="small ghost" onClick={() => setOtp(devCode)}>Use this code</button>
            </div>
          </div>
        )}
        <button className="primary" style={{ width: '100%', marginTop: 14 }} disabled={busy || otp.length !== 6 || !email} onClick={submit}>
          {busy ? 'Verifying…' : 'Verify my email'}
        </button>
        <div className="row spread" style={{ marginTop: 14 }}>
          <span className="muted">Didn't get it?</span>
          <button className="small ghost" disabled={cooldown > 0 || !email} onClick={resend}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
          </button>
        </div>
      </div>
    </div>
  );
}
