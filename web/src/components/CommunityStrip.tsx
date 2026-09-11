import { useEffect, useState } from 'react';
import { apiUrl } from '../api.js';

interface Highlight {
  username: string;
  full_name: string;
  avatar_url: string;
  location?: string | null;
  ethnic_group?: string | null;
}

interface Stats {
  totalProfiles: number;
  demoProfiles: number;
  realProfiles: number;
}

/**
 * Overlapping strip of REAL seeded member profile pictures (fetched from the
 * public /community/highlights endpoint) + social-proof caption with the
 * profile counter (including seeded members) from /stats. Renders whatever
 * part is available, so the auth pages never block or break.
 */
export default function CommunityStrip() {
  const [data, setData] = useState<{ items: Highlight[]; total: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(apiUrl('community/highlights'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && Array.isArray(d.items) && d.items.length) setData(d); })
      .catch(() => { /* decorative — stay hidden offline */ });
    fetch(apiUrl('stats'))
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => { if (alive && s && s.totalProfiles) setStats(s); })
      .catch(() => { /* decorative — stay hidden offline */ });
    return () => { alive = false; };
  }, []);

  if (!data && !stats) return null;
  return (
    <div className="community-strip">
      {data && (
        <div className="community-avatars">
          {data.items.slice(0, 8).map((u) => (
            <img key={u.username} src={u.avatar_url} alt={u.full_name}
              title={`${u.full_name}${u.location ? ' · ' + u.location : ''}`} />
          ))}
        </div>
      )}
      <div className="community-caption">
        {stats ? (
          <><b>{stats.totalProfiles} profiles</b> on Gadaviral — {stats.realProfiles} real, {stats.demoProfiles} seeded</>
        ) : (
          <><b>{data?.total ?? 0} members</b> already sharing — join them</>
        )}
      </div>
    </div>
  );
}