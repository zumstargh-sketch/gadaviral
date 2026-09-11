import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import PostCard from '../components/PostCard.js';
import { Avatar } from '../components/ui.js';

export default function Profile() {
  const { username } = useParams();
  const { user: me } = useAuth();
  const [data, setData] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await api.get(`/users/${username}`);
      setData(p);
      const list = await api.get(`/posts?username=${username}&limit=20`);
      setPosts(list.items);
    } catch (e: any) { setError(e.message); }
  }, [username]);

  useEffect(() => { load(); }, [username]);

  if (error) return <div className="card error">{error}</div>;
  if (!data) return <div className="card muted">Loading…</div>;

  const u = data.user;
  const isMe = me?.id === u.id;

  const follow = async () => {
    const wasFollowing = data.viewer.following;
    // Optimistic update — the button reacts instantly, the request confirms.
    data.viewer.following = !wasFollowing;
    data.user.follower_count = Math.max(0, (Number(data.user.follower_count) || 0) + (wasFollowing ? -1 : 1));
    setData({ ...data });
    try {
      if (wasFollowing) await api.del(`/users/${username}/follow`);
      else await api.post(`/users/${username}/follow`, {});
      load();
    } catch (e: any) { setError(e.message); load(); }
  };
  const block = async () => {
    if (!confirm('Block this user? This removes mutual follows.')) return;
    if (data.viewer?.blocked) await api.del(`/users/${username}/block`);
    else await api.post(`/users/${username}/block`, {});
    load();
  };
  const mute = async () => { await api.post(`/users/${username}/mute`, {}); alert('User muted.'); };

  return (
    <div>
      {u.cover_url && <img className="cover" src={u.cover_url} alt="" />}
      <div className="card">
        <div className="row" style={{ alignItems: 'flex-start', marginTop: u.cover_url ? -40 : 0 }}>
          <Avatar user={u} size="lg" />
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0 }}>
              {u.full_name}
              {u.is_demo && <> <span className="badge demo">DEMO / SEED</span></>}
              {['MODERATOR', 'ADMIN', 'SUPER_ADMIN'].includes(u.role) && <> <span className="badge gold">{u.role}</span></>}
            </h2>
            <div className="muted">@{u.username}</div>
          </div>
          {!isMe && (
            <div className="row wrap">
              <button className={data.viewer.following ? 'ghost' : 'primary'} onClick={follow}>
                {data.viewer.following ? 'Following ✓' : 'Follow'}
              </button>
              <button className="ghost" onClick={mute}>Mute</button>
              <button className="ghost" onClick={block}>Block</button>
              <button className="ghost" onClick={() => {
                const details = prompt('Why are you reporting this user?');
                if (details !== null) api.post('/reports', { targetType: 'USER', targetId: u.id, category: 'OTHER', details })
                  .then(() => alert('Report received — thank you.'));
              }}>Report</button>
            </div>
          )}
        </div>
        {u.bio && <p>{u.bio}</p>}
        <div className="row wrap muted">
          {u.community && <span>📍 {u.location ?? ''} {u.community}</span>}
          {u.occupation && <span>💼 {u.occupation}</span>}
          {u.ethnic_group && u.ethnic_group !== 'UNSPECIFIED' && <span>🪘 {u.ethnic_group}</span>}
          {u.languages?.length > 0 && <span>🗣️ {u.languages.join(', ')}</span>}
          {u.interests?.length > 0 && <span> tagged: {u.interests.join(', ')}</span>}
        </div>
        <div className="row" style={{ gap: 24, marginTop: 12 }}>
          <span><b>{u.posts_count}</b> <span className="muted">posts</span></span>
          <span><b>{u.follower_count}</b> <span className="muted">followers</span></span>
          <span><b>{u.following_count}</b> <span className="muted">following</span></span>
        </div>
      </div>
      {posts.map((p) => <PostCard key={p.id} post={p} onChange={load} />)}
      {posts.length === 0 && <div className="card muted">No posts yet.</div>}
    </div>
  );
}
