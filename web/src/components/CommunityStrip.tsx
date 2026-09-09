import { useEffect, useState } from 'react';
import { apiUrl } from '../api.js';

interface Highlight {
  username: string;
  full_name: string;
  avatar_url: string;
  location?: string | null;
  ethnic_group?: string | null;
}

/**
 * Overlapping strip of REAL seeded member profile pictures (fetched from the
 * public /community/highlights endpoint) + social-proof caption. Renders
 * nothing until data arrives, so the auth pages never block or break.
 */
export default function CommunityStrip() {
  const [data, setData] = useState<{ items: Highlight[]; total: number } | null>(null);

  useEffect(() => {
    let alive = true;
    // Public (no-auth) decorative endpoint. Route names follow the API spec —
    // silently stays hidden while the WordPress API does not expose it yet.
    fetch(apiUrl('community/highlights'))
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && Array.isArray(d.items) && d.items.length) setData(d); })
      .catch(() => { /* decorative — stay hidden offline */ });
    return () => { alive = false; };
  }, []);

  if (!data) return null;
  return (
    <div className="community-strip">
      <div className="community-avatars">
        {data.items.slice(0, 8).map((u) => (
          <img key={u.username} src={u.avatar_url} alt={u.full_name}
            title={`${u.full_name}${u.location ? ' · ' + u.location : ''}`} />
        ))}
      </div>
      <div className="community-caption">
        <b>{data.total} members</b> already sharing — join them
      </div>
    </div>
  );
}