import { getStore } from '@netlify/blobs';
import { getUser, verifyRequestOrigin } from '@netlify/identity';

const store = getStore('warning-signs-user-data');
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function validGroups(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const code = String(item?.code || '').trim().toLowerCase();
    const name = String(item?.name || '').trim().slice(0, 30);
    return /^[a-z0-9]{3,12}$/.test(code) && name ? [{ code, name }] : [];
  });
}

function validProfile(value) {
  const avatar = typeof value?.avatar === 'string' && value.avatar.startsWith('data:image/jpeg;') && value.avatar.length <= 40000
    ? value.avatar : '';
  return {
    displayName: String(value?.displayName || '').trim().slice(0, 24),
    bio: String(value?.bio || '').trim().slice(0, 100),
    avatar,
  };
}

export default async (request) => {
  let user;
  try { user = await getUser(); } catch { user = null; }
  if (!user?.id) return json({ error: 'Entre na sua conta para salvar os dados.' }, 401);

  const key = `user-${user.id}`;
  if (request.method === 'GET') {
    const data = await store.get(key, { type: 'json' }) || {};
    return json({ groups: validGroups(data.groups), profile: validProfile(data.profile) });
  }

  if (request.method !== 'PUT') return json({ error: 'Método não permitido.' }, 405);
  try {
    verifyRequestOrigin(request);
    const body = await request.json();
    const data = { groups: validGroups(body.groups), profile: validProfile(body.profile) };
    await store.setJSON(key, data);
    return json({ saved: true });
  } catch {
    return json({ error: 'Não foi possível salvar seus dados.' }, 400);
  }
};
