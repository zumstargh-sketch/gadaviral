import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.js';
import Composer from '../components/Composer.js';

export default function GroupDetail() {
  const { slug } = useParams();
  const [group, setGroup] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);

  const load = async () => {
    const g = await api.get(`/groups/${slug}`);
    setGroup(g.group);
    const p = await api.get(`/posts?groupId=${g.group.id}&limit=20`);
    setPosts(p.items);
  };
  useEffect(() => { load(); }, [slug]);

  if (!group) return <div className="card muted">Loading…</div>;

  return (
    <div>
      <div className="card">
        <Link to="/groups" className="muted">← All groups</Link>
        <h2 style={{ margin: '8px 0 4px' }}>{group.name} {group.is_demo && <span className="badge demo">DEMO</span>}</h2>
        <p className="muted">{group.description}</p>
        <div className="row spread">
          <span className="badge">{group.member_count} members · {group.privacy}</span>
          <Link to={`/u/${group.creator_username ?? ''}`} className="muted" style={{ display: group.creator_username ? undefined : 'none' }}>
            created by @{group.creator_username}
          </Link>
        </div>
      </div>
      {group.joined
        ? <Composer onPosted={load} />
        : <div className="card muted">Join this group to post in it.</div>}
      {posts.map((p) => <PostCard key={p.id} post={p} onChange={load} />)}
      {posts.length === 0 && <div className="card muted">No posts in this group yet.</div>}
    </div>
  );
}
