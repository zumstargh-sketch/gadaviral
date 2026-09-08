import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.js';
import { Avatar } from './ui.js';

export default function SettingsProfile() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState<any>({});
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user || loaded) return;
    api.get('/auth/me').then((me) => {
      const p = me.profile ?? {};
      setForm({
        fullName: me.user.full_name, bio: p.bio ?? '', location: p.location ?? '',
        hometown: p.hometown ?? '', community: p.community ?? '', ethnicGroup: p.ethnic_group ?? 'UNSPECIFIED',
        occupation: p.occupation ?? '', education: p.education ?? '',
        gender: p.gender ?? '', dateOfBirth: p.date_of_birth?.slice(0, 10) ?? '',
        interests: (p.interests ?? []).join(', '), languages: (p.languages ?? []).join(', '),
      });
      setLoaded(true);
    });
  }, [user?.id]);

  const save = async () => {
    setErr(''); setMsg('');
    try {
      await api.patch('/users/me', {
        fullName: form.fullName, bio: form.bio, location: form.location,
        hometown: form.hometown, community: form.community,
        ethnicGroup: form.ethnicGroup || undefined, occupation: form.occupation,
        education: form.education, gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        interests: form.interests.split(',').map((s: string) => s.trim()).filter(Boolean),
        languages: form.languages.split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      setMsg('Profile saved ✔'); refresh();
    } catch (e: any) { setErr(e.message); }
  };

  const uploadPic = async (kind: 'avatar' | 'cover', file: File) => {
    setErr(''); setMsg('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      await api.upload(`/users/me/${kind}`, fd);
      setMsg(`${kind} updated ✔`); refresh();
    } catch (e: any) { setErr(e.message); }
  };

  if (!user) return null;
  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <Avatar user={user} size="lg" />
        <div>
          <label className="muted">Profile photo</label><br />
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadPic('avatar', e.target.files[0])} />
          <label className="muted" style={{ display: 'block', marginTop: 8 }}>Cover photo</label>
          <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadPic('cover', e.target.files[0])} />
        </div>
      </div>
      <div className="grid2">
        <input placeholder="Full name" value={form.fullName ?? ''} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <input placeholder="Username" value={user.username} disabled title="Usernames are permanent" />
        <input placeholder="Location" value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} />
        <input placeholder="Hometown" value={form.hometown ?? ''} onChange={(e) => setForm({ ...form, hometown: e.target.value })} />
        <input placeholder="Community" value={form.community ?? ''} onChange={(e) => setForm({ ...form, community: e.target.value })} />
        <select value={form.ethnicGroup} onChange={(e) => setForm({ ...form, ethnicGroup: e.target.value })}>
          {['UNSPECIFIED', 'GA', 'DANGME', 'KROBO', 'ADA', 'SHAI', 'NINGO', 'PRAMPRAM', 'OSUDOKU', 'OTHER'].map((x) => <option key={x}>{x}</option>)}
        </select>
        <input placeholder="Occupation" value={form.occupation ?? ''} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
        <input placeholder="Education" value={form.education ?? ''} onChange={(e) => setForm({ ...form, education: e.target.value })} />
        <select value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
          <option value="">Gender (private)</option><option value="MALE">Male</option>
          <option value="FEMALE">Female</option><option value="OTHER">Other</option>
        </select>
        <input type="date" value={form.dateOfBirth ?? ''} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
      </div>
      <textarea placeholder="Bio" value={form.bio ?? ''} onChange={(e) => setForm({ ...form, bio: e.target.value })} style={{ marginTop: 10 }} />
      <div className="grid2" style={{ marginTop: 10 }}>
        <input placeholder="Interests (comma separated)" value={form.interests ?? ''} onChange={(e) => setForm({ ...form, interests: e.target.value })} />
        <input placeholder="Languages (Ga, English…)" value={form.languages ?? ''} onChange={(e) => setForm({ ...form, languages: e.target.value })} />
      </div>
      <button className="primary" style={{ marginTop: 12 }} onClick={save}>Save profile</button>
    </div>
  );
}
