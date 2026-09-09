import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';

/** Landing page after Google OAuth callback — stores the session tokens from the URL. */
export default function GoogleComplete() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { refresh } = useAuth();

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const isNew = params.get('isNew') === 'true';
    const needsProfile = params.get('needsProfile') === 'true';
    if (!accessToken) { nav('/login?google=error'); return; }
    api.setTokens(accessToken, params.get('refreshToken'));
    refresh().then(() => {
      nav(needsProfile ? '/settings?welcome=1' : '/feed');
    });
  }, []);

  return (
    <div className="auth-wrap">
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>Signing you in with Google…</h2>
        <p className="muted">One moment please.</p>
      </div>
    </div>
  );
}
