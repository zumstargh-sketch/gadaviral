import { Link, useSearchParams } from 'react-router-dom';

export default function Verified() {
  const [params] = useSearchParams();
  const email = params.get('email');
  return (
    <div className="auth-wrap">
      <div className="card" style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--ok)' }}>Email verified ✔</h2>
        <p className="muted">{email ? `${email} is now confirmed.` : 'Your email is now confirmed.'}</p>
        <Link to="/feed"><button className="primary">Go to your feed</button></Link>
      </div>
    </div>
  );
}
