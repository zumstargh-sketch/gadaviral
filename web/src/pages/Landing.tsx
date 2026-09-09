import { Link } from 'react-router-dom';
import CommunityStrip from '../components/CommunityStrip.js';

export default function Landing() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, textAlign: 'center' }}>
      <img className="landing-logo" src={`${import.meta.env.BASE_URL}icons/logo-512.png`} alt="GADAVIRAL logo" />
      <div style={{ fontSize: 64, fontWeight: 900, color: 'var(--gold)', letterSpacing: 2, marginTop: 8 }}>
        GADA<span style={{ color: '#fff' }}>VIRAL</span>
      </div>
      <div className="muted" style={{ letterSpacing: 4, textTransform: 'uppercase', fontSize: 12 }}>
        Dangme &amp; Ga Online Social Community
      </div>
      <h1 style={{ marginTop: 32 }}>Connect · Share · Build Together</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 640, margin: '0 auto 30px' }}>
        The digital home for Ga and Dangme people in Ghana and around the world —
        share culture, learn our languages, celebrate Homowo, Ngmayem and Asafotufiam,
        discover our businesses and build community.
      </p>
      <div className="row" style={{ justifyContent: 'center', gap: 14 }}>
        <Link to="/register"><button className="primary" style={{ padding: '12px 30px' }}>Create account</button></Link>
        <Link to="/login"><button className="ghost" style={{ padding: '12px 30px' }}>Log in</button></Link>
      </div>
      <div className="grid2" style={{ marginTop: 48, textAlign: 'left' }}>
        {[
          ['🗣️', 'Language & heritage', 'Practice Ga and Dangme, share proverbs, and preserve oral history.'],
          ['🎉', 'Festivals', 'Homowo, Kplejoo, Ngmayem, Asafotufiam and Dipo — celebrated and documented.'],
          ['🛍️', 'Business directory', 'Find and support Ga and Dangme-owned businesses.'],
          ['🌍', 'Diaspora', 'London to Toronto to Accra — stay rooted wherever you are.'],
        ].map(([icon, title, text]) => (
          <div className="card" key={title}>
            <div style={{ fontSize: 28 }}>{icon}</div>
            <b>{title}</b>
            <p className="muted">{text}</p>
          </div>
        ))}
      </div>
      <CommunityStrip />
      <div className="made-by">Made by <span>DATILA Solutions</span></div>
    </div>
  );
}
