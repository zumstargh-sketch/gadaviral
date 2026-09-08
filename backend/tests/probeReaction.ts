// Smoke test against the live API on :4000 (dev database with demo seed).
const BASE = 'http://localhost:4000/api/v1';

async function j(method: string, path: string, body?: any, token?: string) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* ignore */ }
  return { status: res.status, data };
}

const health = await j('GET', '/health');
console.log('health:', health.status, health.data?.status, 'db:', health.data?.db);

const feed = await j('GET', '/posts?feed=recent&limit=5');
console.log('feed:', feed.status, 'items:', feed.data?.items?.length ?? 0,
  'first:', feed.data?.items?.[0]?.author_name, '|', String(feed.data?.items?.[0]?.content).slice(0, 60));

const demoStats = await j('GET', '/search?q=homowo');
console.log('search homowo:', demoStats.status, 'posts:', demoStats.data?.posts?.length, 'groups:', demoStats.data?.groups?.length);

const groups = await j('GET', '/groups?limit=5');
console.log('groups:', groups.status, groups.data?.items?.map((g: any) => g.name).join(', '));

const events = await j('GET', '/events?limit=5');
console.log('events:', events.status, events.data?.items?.length);

const biz = await j('GET', '/businesses?limit=5');
console.log('businesses:', biz.status, biz.data?.items?.length);

// Real registration round-trip against the dev server
const email = `smoke-${Date.now()}@gadaviral.test`;
const reg = await j('POST', '/auth/register', { email, password: 'SmokeTest123!', fullName: 'Nii Smoke Tester' });
console.log('register:', reg.status, reg.data?.message);
