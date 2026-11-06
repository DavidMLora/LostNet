import { API_BASE_URL } from './config.js';

export const ENDPOINTS = Object.freeze({
  REPORTES: '/reportes',
  REPORTAR: '/reportar',
  PUNTOS_SEGUROS: '/puntos-seguros',
  ALERTAS: '/mis-alertas',
  CONFIG: '/config',
  CONTACTO: '/contacto',
  COMENTARIOS_GET: '/comentarios',
  COMENTAR_POST: '/comentar',
});

export class ApiError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export class ApiService {
  constructor({ baseUrl = API_BASE_URL, timeoutMs = 5000, postTimeoutMs = timeoutMs * 12 } = {}) {
    this.baseUrl = (baseUrl || 'https://lostnet-api.tail0e8b19.ts.net/api').replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
    this.postTimeoutMs = postTimeoutMs;
  }

  get(endpoint, params) {
    return this.#request('GET', endpoint, { params });
  }

  async post(endpoint, body, { params } = {}) {
    if (body instanceof FormData) {
      return this.#request('POST', endpoint, { params, body });
    }
    return this.#request('POST', endpoint, {
      params,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async put(endpoint, body, { params } = {}) {
    if (body instanceof FormData) {
      return this.#request('PUT', endpoint, { params, body });
    }
    return this.#request('PUT', endpoint, {
      params,
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  delete(endpoint, params) {
    return this.#request('DELETE', endpoint, { params });
  }

  resolveUrl(path) {
    if (typeof path !== 'string' || !path.trim()) return null;
    try {
      const url = new URL(path, new URL(this.baseUrl).origin);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch {
      return null;
    }
  }

  async #request(method, endpoint, { params = {}, body, headers }) {
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const baseUrl = new URL(this.baseUrl);
    const url = new URL(`${this.baseUrl}${formattedEndpoint}`);
    const basePath = baseUrl.pathname.replace(/\/+$/, '');
    if (
      url.origin !== baseUrl.origin
      || (basePath && url.pathname !== basePath && !url.pathname.startsWith(`${basePath}/`))
    ) {
      throw new TypeError('La ruta de la API debe permanecer dentro de su prefijo.');
    }

    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, value);
    }
    if (method === 'GET') url.searchParams.set('_t', Date.now());

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(),
      method === 'POST' ? this.postTimeoutMs : this.timeoutMs);

    try {
      const response = await fetch(url, { method, body, headers, signal: controller.signal });
      if (!response.ok) {
        throw new ApiError('http', `La API respondió con HTTP ${response.status}.`, response.status);
      }
      if (response.status === 204 || response.status === 205) return null;
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError('timeout', 'Se agotó el tiempo de espera de la API.');
      }
      if (error instanceof SyntaxError) {
        throw new ApiError('response', 'La API devolvió una respuesta JSON inválida.');
      }
      throw new ApiError('network', 'No se pudo establecer o mantener la conexión con la API.');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const api = new ApiService();
