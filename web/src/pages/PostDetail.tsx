import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import PostCard from '../components/PostCard.js';
import { Avatar } from '../components/ui.js';
import { useAuth } from '../auth.js';

export default function PostDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const p = await api.get(`/posts/${id}`);
      setPost(p.post);
      const c = await api.get(`/posts/${id}/comments?limit=50`);
      setComments(c.items);
    } catch (e: any) { setError(e.message); }
  }, [id]);

  useEffect(() => { load(); }, [id]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await api.post(`/posts/${id}/comments`, { content: text, parentCommentId: replyTo ?? undefined });
      setText(''); setReplyTo(null);
      load();
    } catch (e: any) { setError(e.message); }
  };

  const loadReplies = async (commentId: string) => {
    const r = await api.get(`/posts/comments/${commentId}/replies`);
    setComments((cs) => cs.map((c) => (c.id === commentId ? { ...c, replies: r.items } : c)));
  };

  if (error) return <div className="card error">{error}</div>;
  if (!post) return <div className="card muted">Loading…</div>;

  return (
    <div>
      <PostCard post={post} onChange={load} />
      <div className="card">
        <b>Comments ({post.comment_count})</b>
        <div className="row" style={{ alignItems: 'flex-start', marginTop: 12 }}>
          <Avatar user={user} size="sm" />
          <div style={{ flex: 1 }}>
            {replyTo && (
              <div className="muted">replying · <button className="small ghost" onClick={() => setReplyTo(null)}>cancel</button></div>
            )}
            <textarea placeholder="Write a comment…" value={text} onChange={(e) => setText(e.target.value)}
              style={{ minHeight: 60 }} />
            <button className="primary small" style={{ marginTop: 8 }} onClick={send} disabled={!text.trim()}>Send</button>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          {comments.map((c) => (
            <div key={c.id} style={{ borderTop: '1px solid var(--line)', padding: '10px 0' }}>
              <div className="row" style={{ gap: 8 }}>
                <Avatar user={{ avatar_url: c.author_avatar, full_name: c.author_name }} size="sm" />
                <div style={{ flex: 1 }}>
                  <Link to={`/u/${c.author_username}`} style={{ fontWeight: 700, color: 'var(--text)' }}>{c.author_name}</Link>
                  <div>{c.content}</div>
                  <div className="row muted" style={{ gap: 12 }}>
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                    <button className="small ghost" onClick={() => setReplyTo(c.id)}>Reply</button>
                    {c.reply_count > 0 && !c.replies && (
                      <button className="small ghost" onClick={() => loadReplies(c.id)}>
                        Show {c.reply_count} repl{Number(c.reply_count) === 1 ? 'y' : 'ies'}
                      </button>
                    )}
                  </div>
                  {c.replies?.map((r: any) => (
                    <div key={r.id} className="row" style={{ gap: 8, marginTop: 8, paddingLeft: 30 }}>
                      <Avatar user={{ avatar_url: r.author_avatar, full_name: r.author_name }} size="sm" />
                      <div>
                        <Link to={`/u/${r.author_username}`} style={{ fontWeight: 700, color: 'var(--text)' }}>{r.author_name}</Link>
                        <div>{r.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
