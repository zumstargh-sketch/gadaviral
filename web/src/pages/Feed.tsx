import { useEffect, useState, useCallback, useRef } from 'react';
import PostCard from '../components/PostCard.js';
import Composer from '../components/Composer.js';
import { api } from '../api.js';

export default function Feed() {
  const [posts, setPosts] = useState<any[]>([]);
  const [feed, setFeed] = useState('recent');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loader = useRef<HTMLDivElement>(null);

  const load = useCallback(async (p: number, mode: string, replace = false) => {
    setLoading(true);
    try {
      const data = await api.get(`/posts?feed=${mode}&page=${p}&limit=10`);
      setPosts((prev) => (replace ? data.items : [...prev, ...data.items]));
      setHasMore(p < data.meta.totalPages);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1, feed, true); setPage(1); }, [feed]);

  useEffect(() => {
    const el = loader.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMore && !loading) {
        const next = page + 1;
        setPage(next);
        load(next, feed);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loading, page, feed, load]);

  return (
    <div>
      <div className="tabs">
        {[['recent', 'Recent'], ['following', 'Following'], ['recommended', 'Trending']].map(([k, label]) => (
          <button key={k} className={feed === k ? 'on' : ''} onClick={() => setFeed(k)}>{label}</button>
        ))}
      </div>
      <Composer onPosted={() => load(1, feed, true)} />
      {posts.map((p) => <PostCard key={p.id} post={p} onChange={() => load(1, feed, true)} />)}
      <div ref={loader} style={{ textAlign: 'center', padding: 20 }} className="muted">
        {loading ? 'Loading…' : hasMore ? '' : 'You reached the end — medaase!'}
      </div>
    </div>
  );
}
