import { GOOGLE_CLIENT_ID } from './config.js';

const SESSION_KEY = 'lostnet.session';
const SESSION_VERSION = 1;

export function createSession(clientId, getStorage = () => globalThis.sessionStorage) {
  function clearSession() {
    getStorage().removeItem(SESSION_KEY);
  }

  function isUsable(session) {
    return Boolean(
      clientId
      && session?.version === SESSION_VERSION
      && session.audience === clientId
      && Number.isSafeInteger(session.expiresAt)
      && session.expiresAt > Date.now()
      && typeof session.user?.sub === 'string' && session.user.sub.trim()
      && typeof session.user.email === 'string' && session.user.email.trim()
      && typeof session.user.name === 'string'
    );
  }

  function saveSession({ user, expiresAt }) {
    const session = {
      version: SESSION_VERSION,
      audience: clientId,
      expiresAt,
      user: { sub: user.sub, email: user.email, name: user.name },
    };
    if (!isUsable(session)) throw new Error('Sesión inválida o caducada.');
    getStorage().setItem(SESSION_KEY, JSON.stringify(session));
  }

  function getSession() {
    try {
      const raw = getStorage().getItem(SESSION_KEY);
      if (raw === null) return null;
      const session = JSON.parse(raw);
      if (isUsable(session)) {
        const { user: { sub, email, name }, expiresAt } = session;
        return { user: { sub, email, name }, expiresAt };
      }
    } catch {
      // A damaged record or inaccessible storage leaves the visitor signed out.
    }
    try {
      clearSession();
    } catch {
      // The browser may prohibit storage entirely.
    }
    return null;
  }

  const getUser = () => getSession()?.user ?? null;
  const getUserId = () => getUser()?.sub ?? null;

  return { clearSession, getSession, getUser, getUserId, saveSession };
}

export const { clearSession, getSession, getUser, getUserId, saveSession } =
  createSession(GOOGLE_CLIENT_ID);
