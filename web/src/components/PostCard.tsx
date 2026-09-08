import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar, timeAgo, useToast } from './ui.js';

const REACTIONS = ['LIKE', 'LOVE', 'CELEBRATE', 'HAHA', 'WOW', 'SAD', 'PROUD'];
const RE_ICONS: Record<string, string> = { LIKE: '👍', LOVE: '❤️', CELEBRATE: '🎉', HAHA: '😂', WOW: '😮', SAD: '😢', PROUD: '🦅' };

export default function PostCard({ post, onChange }: { post: any; onChange?: () => void }) {
  const { show, node } = useToast();
  const [showBar, setShowBar] = useState(false);

  const react = async (type: string) => {
    try { await api.put(`/posts/${post.id}/react`, { type }); setShowBar(false); onChange?.(); }
    catch (e: any) { show(e.message); }
  };
  const vote = async (optionId: string) => {
    try { await api.post(`/posts/${post.id}/vote`, { optionId }); onChange?.(); }
    catch (e: any) { show(e.message); }
  };
  const share = async () => {
    try { await api.post(`/posts/${post.id}/share`, { target: 'PROFILE' }); show('Shared ✔'); onChange?.(); }
    catch (e: any) { show(e.message); }
  };

  const totalVotes = post.poll?.totalVotes ?? 0;

  return (
    <div className="post" style={{ position: 'relative' }}>
      <div className="head">
        <Link to={`/u/${post.author_username}`}>
          <Avatar user={{ avatar_url: post.author_avatar, full_name: post.author_name }} />
        </Link>
        <div style={{ flex: 1 }}>
          <Link to={`/u/${post.author_username}`} style={{ color: 'var(--text)', fontWeight: 700 }}>{post.author_name}</Link>
          {post.author_is_demo && <> <span className="badge demo">DEMO</span></>}
          {post.type === 'ANNOUNCEMENT' && <> <span className="badge gold">ANNOUNCEMENT</span></>}
          <div className="muted">@{post.author_username} · {timeAgo(post.created_at)}{post.is_demo ? ' · demo' : ''}</div>
        </div>
      </div>
      <div className="content">{post.content}</div>
      {post.sharedPost && (
        <div className="card" style={{ margin: '8px 0', padding: 10 }}>
          <div className="muted">@{post.sharedPost.author_username} wrote:</div>
          <div>{post.sharedPost.content?.slice(0, 200)}</div>
        </div>
      )}
      {post.poll && (
        <div>
          <b>{post.poll.question}</b>
          {post.poll.options.map((o: any) => {
            const pct = totalVotes ? Math.round((Number(o.votes) / totalVotes) * 100) : 0;
            return (
              <button key={o.id} className="poll-option" onClick={() => vote(o.id)}>
                <div className="fill" style={{ width: `${pct}%` }} />
                <span>{o.label} — {pct}% ({o.votes})</span>
              </button>
            );
          })}
          <div className="muted">{totalVotes} votes</div>
        </div>
      )}
      {post.media?.length > 0 && (
        <div className="media">
          {post.media.map((m: any) => m.media_type === 'VIDEO'
            ? <video key={m.id} src={m.url} controls preload="metadata" />
            : <img key={m.id} src={m.url} alt={m.alt_text ?? ''} loading="lazy" />)}
        </div>
      )}
      <div className="counts">
        <span>{post.reaction_count} reactions</span><span>{post.comment_count} comments</span>
        <span>{post.share_count} shares</span><span>{post.view_count} views</span>
      </div>
      <div className="actions">
        <div style={{ position: 'relative' }}>
          <button className="small ghost" onClick={() => setShowBar(!showBar)}>
            {RE_ICONS[post.viewer?.reaction ?? 'LIKE']} {post.viewer?.reaction ?? 'React'}
          </button>
          {showBar && (
            <div className="reaction-bar" style={{ bottom: '110%' }}>
              {REACTIONS.map((r) => (
                <button key={r} style={{ padding: '4px 8px', background: 'transparent' }} onClick={() => react(r)}>
                  {RE_ICONS[r]}
                </button>
              ))}
            </div>
          )}
        </div>
        <Link to={`/post/${post.id}`}><button className="small ghost">💬 Comment</button></Link>
        <button className="small ghost" onClick={share}>🔁 Share</button>
      </div>
      {node}
    </div>
  );
}
