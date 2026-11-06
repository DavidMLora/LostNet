import assert from 'node:assert/strict';
import { test, vi } from 'vitest';
import { ApiError, ApiService, ENDPOINTS } from '../../src/scripts/api.js';

const baseUrl = 'https://lostnet.test/api/';
const api = new ApiService({ baseUrl });
const matches = (code, status = null) =>
  (error) => error instanceof ApiError && error.code === code && error.status === status;

test('GET codifica la consulta, omite valores nulos y conserva 0 y false', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(url.pathname, '/api/reportes');
    assert.equal(url.searchParams.get('email'), 'a+b@example.test');
    assert.equal(url.searchParams.get('lat'), '0');
    assert.equal(url.searchParams.get('visible'), 'false');
    assert.equal(url.searchParams.has('missing'), false);
    assert.ok(Number(url.searchParams.get('_t')) > 0);
    return Response.json([{ id: 17, lat: 0 }]);
  });
  assert.deepEqual(await api.get(ENDPOINTS.REPORTES, {
    email: 'a+b@example.test', lat: 0, visible: false, missing: null,
  }), [{ id: 17, lat: 0 }]);
});

test('POST serializa JSON con su tipo de contenido y acepta parámetros', async () => {
  const body = { report_id: 17, user_name: 'María', text: 'Prueba' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(url.pathname, '/api/comentar');
    assert.equal(url.searchParams.get('test'), 'a+b');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ ok: true });
  });
  assert.deepEqual(await api.post(ENDPOINTS.COMENTAR_POST, body, {
    params: { test: 'a+b' },
  }), { ok: true });
});

test('POST con FormData deja que el navegador genere el boundary y conserva la foto', async () => {
  const body = new FormData();
  body.set('user_id', 'test-user');
  body.set('foto', new File(['fake-image-bytes'], 'objeto.jpg', { type: 'image/jpeg' }));
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    assert.equal(url.pathname, '/api/reportar');
    assert.equal(options.headers, undefined);
    const request = new Request(url, options);
    assert.match(request.headers.get('content-type'), /^multipart\/form-data; boundary=/);
    const form = await request.formData();
    assert.equal(form.get('user_id'), 'test-user');
    assert.equal(form.get('foto').name, 'objeto.jpg');
    assert.equal(await form.get('foto').text(), 'fake-image-bytes');
    return Response.json({ id: 18 }, { status: 201 });
  });
  assert.deepEqual(await api.post(ENDPOINTS.REPORTAR, body), { id: 18 });
});

test('PUT serializa JSON y acepta parámetros de consulta', async () => {
  const body = { user_id: 'test-user', description: 'Descripción editada' };
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    assert.equal(url.pathname, '/api/reportes/17');
    assert.equal(url.searchParams.get('source'), 'my-reports');
    assert.equal(options.method, 'PUT');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), body);
    return Response.json({ id: 17, ...body });
  });
  assert.deepEqual(await api.put('/reportes/17', body, { params: { source: 'my-reports' } }), {
    id: 17, ...body,
  });
});

test('DELETE envía user_id en la consulta y acepta 204 sin cuerpo', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
    assert.equal(url.pathname, '/api/reportes/17');
    assert.deepEqual([...url.searchParams], [['user_id', 'a/b']]);
    assert.equal(options.method, 'DELETE');
    assert.equal(options.body, undefined);
    return new Response(null, { status: 204 });
  });
  assert.equal(await api.delete('/reportes/17', { user_id: 'a/b' }), null);
});

test('expone el estado HTTP y evita reintentar escrituras', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ error: 'Límite' }, { status: 429 }));
  await assert.rejects(api.post(ENDPOINTS.REPORTAR, new FormData()), matches('http', 429));
  assert.equal(fetch.mock.calls.length, 1);
});

test('distingue un fallo de red de un JSON inválido', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new TypeError('Offline'); });
  await assert.rejects(api.get(ENDPOINTS.REPORTES), matches('network'));
  fetch.mockImplementation(async () => new Response('{broken'));
  await assert.rejects(api.get(ENDPOINTS.REPORTES), matches('response'));
});

test('el tiempo de espera sigue activo al leer el cuerpo de la respuesta', async () => {
  const shortTimeout = new ApiService({ baseUrl, timeoutMs: 20 });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, { signal }) => ({
    ok: true,
    status: 200,
    json: () => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }),
  }));
  await assert.rejects(shortTimeout.get(ENDPOINTS.REPORTES), matches('timeout'));
});

test('rechaza rutas que salen del prefijo y resuelve fotos contra el origen', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  await assert.rejects(api.get('/../outside'), TypeError);
  assert.equal(fetch.mock.calls.length, 0);
  assert.equal(api.resolveUrl('/uploads/photo.jpg'), 'https://lostnet.test/uploads/photo.jpg');
  assert.equal(api.resolveUrl('javascript:alert(1)'), null);
});
