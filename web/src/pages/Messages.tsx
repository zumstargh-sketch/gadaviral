import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api.js';
import { Avatar, timeAgo } from '../components/ui.js';
import { socket } from '../components/Layout.js';
import { useAuth } from '../auth.js';

export default function Messages() {
  const { user: me } = useAuth();
  const [convos, setConvos] = useState<any[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [startUser, setStartUser] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);

  const loadConvos = async () => {
    const d = await api.get('/messages/conversations');
    setConvos(d.items);
  };
  useEffect(() => { loadConvos(); }, []);

  const loadThread = useCallback(async (id: string) => {
    const d = await api.get(`/messages/conversations/${id}?limit=100`);
    setMessages(d.items);
    setTimeout(() => threadRef.current?.scrollTo(0, 1e9), 50);
  }, []);

  useEffect(() => { if (activeId) loadThread(activeId); }, [activeId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (m: any) => {
      if (m.conversation_id === activeId) {
        setMessages((ms) => [...ms, m]);
        setTimeout(() => threadRef.current?.scrollTo(0, 1e9), 50);
      }
      loadConvos();
    };
    socket.on('message', handler);
    return () => { socket.off('message', handler); };
  }, [activeId]);

  const send = async () => {
    if (!text.trim() || !activeId) return;
    await api.post(`/messages/conversations/${activeId}`, { content: text });
    setText('');
    loadThread(activeId);
  };

  const start = async () => {
    try {
      const res = await api.post('/messages/conversations', { username: startUser.replace('@', '') });
      setActiveId(res.conversationId);
      setStartUser('');
      loadConvos();
    } catch (e: any) { alert(e.message); }
  };

  const active = convos.find((c) => c.id === activeId);

  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '70vh', padding: 0, overflow: 'hidden' }}>
      <div style={{ borderRight: '1px solid var(--line)', overflowY: 'auto', maxHeight: '80vh' }}>
        <div style={{ padding: 12 }}>
          <input placeholder="Message @username" value={startUser} onChange={(e) => setStartUser(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && start()} />
        </div>
        {convos.map((c) => (
          <div key={c.id} onClick={() => setActiveId(c.id)} className="row"
            style={{ padding: '10px 12px', cursor: 'pointer', background: c.id === activeId ? 'var(--bg-3)' : undefined }}>
            <Avatar user={{ avatar_url: c.other_avatar, full_name: c.other_name }} size="sm" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{c.other_name}</b> {c.unread > 0 && <span className="badge gold">{c.unread}</span>}
              <div className="muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {c.last_message?.slice(0, 32) ?? 'Say hello!'}
              </div>
            </div>
          </div>
        ))}
        {convos.length === 0 && <p className="muted" style={{ padding: 12 }}>No conversations yet.</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {active ? (
          <>
            <div className="row" style={{ padding: 12, borderBottom: '1px solid var(--line)' }}>
              <Avatar user={{ avatar_url: active.other_avatar, full_name: active.other_name }} size="sm" />
              <b>{active.other_name}</b> <span className="muted">@{active.other_username}</span>
            </div>
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: 12, maxHeight: '60vh' }}>
              {messages.map((m) => (
                <div key={m.id} style={{
                  maxWidth: '70%', margin: '6px 0', padding: '8px 14px', borderRadius: 14,
                  background: m.sender_username === me?.username
                    ? 'var(--gold)' : 'var(--bg-3)',
                  marginLeft: m.is_mine ? 'auto' : 0,
                }}>
                  <div>{m.content}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{timeAgo(m.created_at)} ago · {m.sender_username}</div>
                </div>
              ))}
            </div>
            <div className="row" style={{ padding: 12, borderTop: '1px solid var(--line)' }}>
              <input placeholder="Type a message…" value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()} />
              <button className="primary" onClick={send}>Send</button>
            </div>
          </>
        ) : (
          <div className="muted" style={{ margin: 'auto' }}>Select a conversation or start one with @username.</div>
        )}
      </div>
    </div>
  );
}
