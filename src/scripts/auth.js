import { GOOGLE_CLIENT_ID } from './config.js';
import { saveSession } from './session.js';

const GOOGLE_SDK_URL = 'https://accounts.google.com/gsi/client';
const SDK_TIMEOUT_MS = 10_000;

// These checks read claims from GIS. Cryptographic verification belongs on the server.
export function readGoogleCredential(credential, clientId, nonce) {
  const parts = typeof credential === 'string' ? credential.split('.') : [];
  if (parts.length !== 3 || parts.some((part) => !/^[\w-]+$/.test(part))) {
    throw new Error('Formato de credencial inválido.');
  }
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(payload), (character) => character.charCodeAt(0));
  const claims = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const expiresAt = claims?.exp * 1000;

  if (!clientId || !nonce
    || claims?.aud !== clientId
    || !['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)
    || claims.nonce !== nonce
    || !Number.isSafeInteger(claims.exp) || !Number.isSafeInteger(expiresAt)
    || expiresAt <= Date.now()
    || typeof claims.sub !== 'string' || !claims.sub.trim()
    || typeof claims.email !== 'string' || !claims.email.trim()
    || claims.email_verified !== true) {
    throw new Error('Los datos de la credencial de Google no son válidos.');
  }

  return {
    user: {
      sub: claims.sub,
      email: claims.email,
      name: typeof claims.name === 'string' ? claims.name.trim() : '',
    },
    expiresAt,
  };
}

function loadGoogleIdentity() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GOOGLE_SDK_URL;
    script.async = true;

    function fail() {
      clearTimeout(timeout);
      script.remove();
      reject(new Error('No se pudo cargar Google Identity Services.'));
    }

    const timeout = setTimeout(fail, SDK_TIMEOUT_MS);
    script.addEventListener('error', fail, { once: true });
    script.addEventListener('load', () => {
      const identity = globalThis.google?.accounts?.id;
      if (!identity) {
        fail();
        return;
      }
      clearTimeout(timeout);
      resolve(identity);
    }, { once: true });
    document.head.append(script);
  });
}

export async function renderGoogleSignIn(container, { onSuccess, onError }) {
  const nonce = crypto.randomUUID();
  const identity = await loadGoogleIdentity();
  identity.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: ({ credential }) => {
      try {
        saveSession(readGoogleCredential(credential, GOOGLE_CLIENT_ID, nonce));
      } catch {
        onError();
        return;
      }
      onSuccess();
    },
    nonce,
    auto_select: false,
    ux_mode: 'popup',
  });

  identity.renderButton(container, {
    type: 'standard',
    size: 'large',
    theme: 'outline',
    shape: 'pill',
    text: 'continue_with',
    locale: 'es',
    width: String(Math.min(320, container.clientWidth)),
  });
}
