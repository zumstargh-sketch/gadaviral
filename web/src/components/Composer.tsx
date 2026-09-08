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
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (type === 'POLL') {
        await api.post('/posts', {
          type: 'POLL', content: content || question, visibility,
          poll: { question: question || content, options: pollOptions.filter(Boolean) },
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
      setContent(''); setFiles(null); setQuestion('');
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
        {['TEXT', 'PHOTO', 'POLL', 'ANNOUNCEMENT'].map((t) => (
          <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
        ))}
        <select style={{ width: 150 }} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          <option value="PUBLIC">🌍 Public</option>
          <option value="FOLLOWERS">👥 Followers</option>
          <option value="PRIVATE">🔒 Only me</option>
        </select>
      </div>
      {type === 'PHOTO' && (
        <input type="file" accept="image/*,video/mp4,video/webm" multiple
          onChange={(e) => setFiles(e.target.files)} style={{ marginBottom: 10 }} />
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
