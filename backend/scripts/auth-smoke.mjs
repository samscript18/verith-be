const apiOrigin = (process.env.AUTH_SMOKE_API_URL ?? 'http://localhost:4000/api/v1').replace(/\/$/, '');
const identifier = process.env.AUTH_SMOKE_IDENTIFIER;
const password = process.env.AUTH_SMOKE_PASSWORD;

if (!identifier || !password) {
  console.error(
    'Set AUTH_SMOKE_IDENTIFIER and AUTH_SMOKE_PASSWORD to an active disposable account.',
  );
  process.exit(2);
}

const cookies = new Map();
let accessToken;

function captureCookies(response) {
  for (const cookie of response.headers.getSetCookie()) {
    const [pair] = cookie.split(';', 1);
    const separator = pair.indexOf('=');
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function request(path, { authenticated = false, body, method = 'GET' } = {}) {
  const headers = new Headers();
  if (body !== undefined) headers.set('content-type', 'application/json');
  if (authenticated && accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  if (cookies.size) headers.set('cookie', cookieHeader());
  if (path === '/auth/refresh' && cookies.has('verith_csrf')) {
    headers.set('x-csrf-token', cookies.get('verith_csrf'));
  }

  const response = await fetch(`${apiOrigin}${path}`, {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers,
    method,
  });
  captureCookies(response);
  const payload = response.status === 204 ? undefined : await response.json();
  return { payload, response };
}

function assert(result, expectedStatus, label) {
  if (result.response.status !== expectedStatus) {
    throw new Error(
      `${label}: expected ${expectedStatus}, received ${result.response.status} (${result.payload?.error?.code ?? 'NO_ERROR_CODE'})`,
    );
  }
  console.log(`PASS ${label} (${expectedStatus})`);
}

const login = await request('/auth/login', {
  body: { deviceName: 'Auth smoke test', identifier, password },
  method: 'POST',
});
assert(login, 200, 'login');
accessToken = login.payload?.data?.accessToken;
if (!accessToken || !cookies.has('verith_refresh') || !cookies.has('verith_csrf')) {
  throw new Error('login: access token or browser session cookies are missing');
}

const me = await request('/auth/me', { authenticated: true });
assert(me, 200, 'current session');

const sessions = await request('/auth/sessions', { authenticated: true });
assert(sessions, 200, 'session list');
if (!Array.isArray(sessions.payload?.data) || sessions.payload.data.length === 0) {
  throw new Error('session list: expected at least one active session');
}

const refresh = await request('/auth/refresh', { body: {}, method: 'POST' });
assert(refresh, 200, 'cookie refresh with CSRF');
accessToken = refresh.payload?.data?.accessToken;

const logout = await request('/auth/logout', { authenticated: true, method: 'POST' });
assert(logout, 204, 'logout');
if (cookies.get('verith_refresh') !== '' || cookies.get('verith_csrf') !== '') {
  throw new Error('logout: browser session cookies were not cleared');
}

const revoked = await request('/auth/me', { authenticated: true });
assert(revoked, 401, 'revoked session rejected');
if (revoked.payload?.error?.code !== 'SESSION_REVOKED') {
  throw new Error('revoked session rejected: expected SESSION_REVOKED');
}

console.log('Authentication smoke test completed successfully.');
