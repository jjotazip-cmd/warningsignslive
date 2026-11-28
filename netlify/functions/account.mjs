import { getUser, login, logout, signup, verifyRequestOrigin } from '@netlify/identity';

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,23}$/;
// Netlify Identity uses an email as its internal identifier. The app exposes
// only usernames; autoconfirm must be enabled in the Netlify Identity settings.
const emailForUsername = (username) => `${username}@users.warningsignslive.invalid`;
const json = (body, status = 200) => Response.json(body, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function cleanUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function publicUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata || user.userMetadata || {};
  const username = String(metadata.username || metadata.full_name || metadata.name || user.email?.split('@')[0] || '');
  return { id: user.id, username };
}

export default async (request) => {
  if (request.method === 'GET') {
    try {
      const user = await getUser();
      return json({ user: publicUser(user) });
    } catch {
      return json({ user: null });
    }
  }

  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

  try {
    verifyRequestOrigin(request);
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'logout') {
      await logout();
      return json({ user: null });
    }

    const username = cleanUsername(body.username);
    const password = String(body.password || '');
    if (!USERNAME_PATTERN.test(username)) {
      return json({ error: 'Use de 3 a 24 caracteres: letras, números, ponto, traço ou sublinhado.' }, 400);
    }
    if (password.length < 8 || password.length > 128) {
      return json({ error: 'A senha precisa ter entre 8 e 128 caracteres.' }, 400);
    }

    const email = emailForUsername(username);
    if (action === 'signup') {
      await signup(email, password, { username, full_name: username });
      // Sign in immediately after registration so the browser receives the auth cookies.
      await login(email, password);
      const user = await getUser();
      return json({ user: publicUser(user) || { id: null, username } }, 201);
    }
    if (action === 'login') {
      await login(email, password);
      const user = await getUser();
      if (!user) return json({ error: 'Não foi possível iniciar a sessão.' }, 401);
      return json({ user: publicUser(user) });
    }
    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    const message = String(error?.message || '');
    if (/already|exists|registered|duplicate/i.test(message)) {
      return json({ error: 'Esse nome de usuário já está cadastrado.' }, 409);
    }
    if (/invalid|credentials|password|not found|unauthorized/i.test(message)) {
      return json({ error: 'Nome de usuário ou senha incorretos.' }, 401);
    }
    return json({ error: 'Não foi possível concluir. Confira se as contas estão ativadas no Netlify e tente novamente.' }, 503);
  }
};
