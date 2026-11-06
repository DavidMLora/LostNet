import assert from 'node:assert/strict';
import test from 'node:test';
import { readGoogleCredential } from '../src/scripts/auth.js';
import { createSession } from '../src/scripts/session.js';

const clientId = 'phase-1-test.apps.googleusercontent.com';
const nonce = 'nonce-de-prueba';
const user = { sub: '12345', email: 'test@example.test', name: 'María' };

function setup() {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  return { data, storage, session: createSession(clientId, () => storage) };
}

function credential(overrides) {
  const claims = {
    ...user,
    aud: clientId,
    iss: 'https://accounts.google.com',
    exp: Math.floor(Date.now() / 1000) + 60,
    email_verified: true,
    nonce,
    ...overrides,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${payload}.signature`;
}

test('una sesión vacía devuelve null', () => {
  const { session } = setup();
  assert.equal(session.getUser(), null);
  assert.equal(session.getUserId(), null);
});

test('persiste solo el perfil mínimo y lo recupera después de recargar', () => {
  const { session, storage, data } = setup();
  const expiresAt = Date.now() + 60_000;
  session.saveSession({ user: { ...user, picture: 'https://example.test/a' }, expiresAt });
  const reloaded = createSession(clientId, () => storage);
  assert.deepEqual(reloaded.getSession(), { user, expiresAt });
  assert.equal(reloaded.getUserId(), user.sub);
  assert.deepEqual([...data.values()].map(JSON.parse), [
    { version: 1, audience: clientId, expiresAt, user },
  ]);
});

test('elimina registros vencidos, incompletos, corruptos o de otro cliente', () => {
  const valid = { version: 1, audience: clientId, expiresAt: Date.now() + 60_000, user };
  const { session, storage, data } = setup();
  for (const raw of [
    JSON.stringify({ ...valid, expiresAt: Date.now() - 1 }),
    JSON.stringify({ ...valid, user: { email: user.email } }),
    JSON.stringify({ ...valid, audience: 'other-client' }),
    JSON.stringify({ ...valid, version: 2 }),
    '{broken',
  ]) {
    storage.setItem('lostnet.session', raw);
    assert.equal(session.getUser(), null);
    assert.equal(data.size, 0);
  }
});

test('rechaza guardar una sesión vencida y al cerrar limpia solo su propia clave', () => {
  const { session, storage } = setup();
  assert.throws(() => session.saveSession({ user, expiresAt: Date.now() - 1 }));
  session.saveSession({ user, expiresAt: Date.now() + 60_000 });
  storage.setItem('other-module', 'value');
  session.clearSession();
  assert.equal(session.getSession(), null);
  assert.equal(storage.getItem('other-module'), 'value');
});

test('el almacenamiento bloqueado deja al usuario sin sesión', () => {
  const session = createSession(clientId, () => { throw new Error('Storage disabled'); });
  assert.equal(session.getUser(), null);
  assert.throws(() => session.saveSession({ user, expiresAt: Date.now() + 60_000 }));
});

test('la lectura de credenciales extrae sub, correo, nombre UTF-8 y vencimiento', () => {
  const exp = Math.floor(Date.now() / 1000) + 60;
  assert.deepEqual(readGoogleCredential(credential({ exp }), clientId, nonce), {
    user, expiresAt: exp * 1000,
  });
});

test('rechaza credenciales mal formadas o con claims incompatibles', () => {
  assert.throws(() => readGoogleCredential('invalid', clientId, nonce));
  for (const overrides of [
    { aud: 'other-client' },
    { iss: 'https://example.test' },
    { nonce: 'other-nonce' },
    { exp: Math.floor(Date.now() / 1000) - 1 },
    { email_verified: false },
    { sub: '' },
    { email: '' },
  ]) {
    assert.throws(() => readGoogleCredential(credential(overrides), clientId, nonce));
  }
});
