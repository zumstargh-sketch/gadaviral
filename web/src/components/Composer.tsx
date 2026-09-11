import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { Avatar, useToast } from './ui.js';

export default function Composer({ onPosted }: { onPosted: () => void }) {
  const { user } = useAuth();
  const { show, node } = useToast();
  const [content, setContent] = useState('');
  const [type, setType] = useState('TEXT');
  const [visibility, setVisibility] = useState('PUBLIC');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [question, setQuestion] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [streamUrl, setStreamUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (type === 'POLL') {
        await api.post('/posts', {
          type: 'POLL', content: content || question, visibility,
          poll: { question: question || content, options: pollOptions.filter(Boolean) },
        });
      } else if (type === 'LIVE') {
        await api.post('/posts', {
          type: 'LIVE', content: content || '🔴 We are LIVE now!', visibility,
          streamUrl,
        });
      } else if (files && files.length > 0) {
        const fd = new FormData();
        fd.append('content', content);
        fd.append('visibility', visibility);
        Array.from(files).slice(0, 6).forEach((f) => fd.append('media', f));
        await api.upload('/posts/media', fd);
      } else {
        await api.post('/posts', { type, content, visibility });
      }
      setContent(''); setFiles(null); setQuestion(''); setStreamUrl('');
      show('Posted ✔');
      onPosted();
    } catch (e: any) { show(e.message); } finally { setBusy(false); }
  };

  if (!user?.email_verified) {
    return (
      <div className="card">
        <b>Welcome, {user?.full_name}!</b>
        <p className="muted">Verify your email to start posting. <Link to="/verify">Verify now →</Link></p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <Avatar user={user} />
        <textarea placeholder="Share something with the community…" value={content}
          onChange={(e) => setContent(e.target.value)} />
      </div>
      <div className="tabs" style={{ marginTop: 10 }}>
        {['TEXT', 'PHOTO', 'POLL', 'ANNOUNCEMENT', 'LIVE'].map((t) => (
          <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t === 'LIVE' ? '🔴 LIVE' : t}</button>
        ))}
        <select style={{ width: 150 }} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="PUBLIC">🌍 Public</option>
          <option value="FOLLOWERS">👥 Followers</option>
          <option value="PRIVATE">🔒 Only me</option>
        </select>
      </div>
      {type === 'PHOTO' && (
        <div className="row" style={{ gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
          <label className="small ghost" style={{ cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6 }}>
            🖼️ Gallery
            <input type="file" accept="image/*,video/mp4,video/webm" multiple style={{ display: 'none' }}
              onChange={(e) => setFiles(e.target.files)} />
          </label>
          <label className="small ghost" style={{ cursor: 'pointer', padding: '6px 12px', border: '1px solid var(--line)', borderRadius: 6 }}>
            📷 Camera
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
              onChange={(e) => { if (e.target.files?.length) { const dt = new DataTransfer(); dt.items.add(e.target.files[0]); setFiles(dt.files); } }} />
          </label>
          {files && <span className="muted">{files.length} file(s) selected</span>}
        </div>
      )}
      {type === 'LIVE' && (
        <div style={{ marginBottom: 10 }}>
          <input placeholder="Paste your livestream link (YouTube / Facebook / Twitch)" value={streamUrl}
            onChange={(e) => setStreamUrl(e.target.value)} style={{ marginBottom: 6 }} />
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Go live with your phone's camera app (YouTube Live, Facebook Live or Twitch),
            then paste the link here — the community watches it right inside this post.
          </p>
        </div>
      )}
      {type === 'POLL' && (
        <div style={{ marginBottom: 10 }}>
          <input placeholder="Poll question" value={question} onChange={(e) => setQuestion(e.target.value)} style={{ marginBottom: 6 }} />
          {pollOptions.map((o, i) => (
            <input key={i} placeholder={`Option ${i + 1}`} value={o} style={{ marginBottom: 6 }}
              onChange={(e) => setPollOptions(pollOptions.map((p, j) => (j === i ? e.target.value : p)))} />
          ))}
          {pollOptions.length < 10 && (
            <button className="small ghost" onClick={() => setPollOptions([...pollOptions, ''])}>+ Add option</button>
          )}
        </div>
      )}
      <div className="row spread">
        <span className="muted">{content.length}/8000</span>
        <button className="primary" disabled={busy || (!content && type === 'TEXT' && !files)} onClick={submit}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
      {node}
    </div>
  );
}
