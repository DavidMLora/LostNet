import { beforeAll, afterAll, afterEach, describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { setTimeout as delay } from 'node:timers/promises';
import { ApiError, ApiService, ENDPOINTS } from '../../src/scripts/api.js';
import { buildReportFormData } from '../../src/scripts/report-form.js';
import { belongsToUser } from '../../src/scripts/my-reports.js';

// Dominio reservado .test: las pruebas nunca tocan producción; toda petición sin manejador es un error.
const base = 'https://lostnet.test/api';
const api = new ApiService({ baseUrl: base });
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const user = { sub: 'google-7', email: 'ana@example.test' };
const photo = () => new File(['image-bytes'], 'objeto.jpg', { type: 'image/jpeg' });
const isApiError = (code, status = null) => (error) =>
  error instanceof ApiError && error.code === code && error.status === status;

describe('CU-14 · Consulta de reportes y puntos seguros', () => {
  it('GET /reportes agrega _t anti-caché y devuelve el JSON completo', async () => {
    const data = [{ id: 17, desc_short: 'Llaves', status: 'FOUND', lat: 0, lon: 0 }];
    server.use(http.get(`${base}/reportes`, ({ request }) => {
      const url = new URL(request.url);
      expect([...url.searchParams.keys()]).toEqual(['_t']);
      expect(Number(url.searchParams.get('_t'))).toBeGreaterThan(0);
      return HttpResponse.json(data);
    }));
    expect(await api.get(ENDPOINTS.REPORTES)).toEqual(data);
  });
  it('GET /puntos-seguros es independiente de los reportes', async () => {
    server.use(http.get(`${base}/puntos-seguros`, () => HttpResponse.json([{ id: 1, nombre: 'Biblioteca' }])));
    expect(await api.get(ENDPOINTS.PUNTOS_SEGUROS)).toEqual([{ id: 1, nombre: 'Biblioteca' }]);
  });
  it('omite parámetros nulos sin perder 0 ni false', async () => {
    server.use(http.get(`${base}/reportes`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      expect(params.has('missing')).toBe(false);
      expect(params.get('zero')).toBe('0');
      expect(params.get('flag')).toBe('false');
      return HttpResponse.json([]);
    }));
    expect(await api.get(ENDPOINTS.REPORTES, { missing: null, zero: 0, flag: false })).toEqual([]);
  });
  it('conserva registros incompletos para que la interfaz decida', async () => {
    server.use(http.get(`${base}/reportes`, () => HttpResponse.json([{ id: 7 }, null, {}])));
    expect(await api.get(ENDPOINTS.REPORTES)).toEqual([{ id: 7 }, null, {}]);
  });
});

describe('CU-03 / CU-07 · Publicación de reportes', () => {
  it('envía el multipart real del formulario con la foto', async () => {
    const body = buildReportFormData({
      user, status: 'FOUND', title: 'Audífonos', category: 'Electrónica', description: 'Audífonos blancos',
      photo: photo(), latitude: 0, longitude: -102.29, nowMs: 1_234_567_890_000,
    });
    server.use(http.post(`${base}/reportar`, async ({ request }) => {
      expect(request.headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
      const form = await request.formData();
      expect(form.get('user_id')).toBe('google-7');
      expect(form.get('status')).toBe('FOUND');
      expect(form.get('latitude')).toBe('0');
      expect(form.get('timestamp')).toBe('1234567890');
      expect(await form.get('foto').text()).toBe('image-bytes');
      return HttpResponse.json({ ok: true, id: 30 }, { status: 201 });
    }));
    expect(await api.post(ENDPOINTS.REPORTAR, body)).toEqual({ ok: true, id: 30 });
  });
  it('HTTP 429 (cuota diaria) se propaga sin reintentos ni éxito falso', async () => {
    let calls = 0;
    server.use(http.post(`${base}/reportar`, () => { calls++; return HttpResponse.json({ error: 'Cuota' }, { status: 429 }); }));
    await expect(api.post(ENDPOINTS.REPORTAR, new FormData())).rejects.toSatisfy(isApiError('http', 429));
    expect(calls).toBe(1);
  });
  it('HTTP 413 (foto demasiado grande) se informa con su estado', async () => {
    server.use(http.post(`${base}/reportar`, () => new HttpResponse(null, { status: 413 })));
    await expect(api.post(ENDPOINTS.REPORTAR, new FormData())).rejects.toSatisfy(isApiError('http', 413));
  });
});

describe('CU-10 · Mis reportes', () => {
  it('el listado del servidor se filtra por propietario', async () => {
    server.use(http.get(`${base}/reportes`, () => HttpResponse.json([
      { id: 1, user_id: 'google-7' }, { id: 2, email: 'ANA@example.test' }, { id: 3, user_id: 'otro' },
    ])));
    const mine = (await api.get(ENDPOINTS.REPORTES)).filter((report) => belongsToUser(report, user));
    expect(mine.map((report) => report.id)).toEqual([1, 2]);
  });
  it('DELETE /reportes/{id} envía user_id y acepta 204 sin cuerpo', async () => {
    server.use(http.delete(`${base}/reportes/:id`, async ({ request, params }) => {
      expect(params.id).toBe('17');
      expect([...new URL(request.url).searchParams]).toEqual([['user_id', 'google-7']]);
      expect(await request.text()).toBe('');
      return new HttpResponse(null, { status: 204 });
    }));
    expect(await api.delete('/reportes/17', { user_id: 'google-7' })).toBeNull();
  });
  it('DELETE de un reporte ajeno propaga HTTP 403', async () => {
    server.use(http.delete(`${base}/reportes/17`, () => new HttpResponse(null, { status: 403 })));
    await expect(api.delete('/reportes/17', { user_id: 'otro' })).rejects.toSatisfy(isApiError('http', 403));
  });
  it('PUT /reportes/{id} envía la edición como JSON', async () => {
    const edit = { user_id: 'google-7', description: 'Descripción editada' };
    server.use(http.put(`${base}/reportes/17`, async ({ request }) => {
      expect(request.headers.get('content-type')).toBe('application/json');
      expect(await request.json()).toEqual(edit);
      return HttpResponse.json({ id: 17, ...edit });
    }));
    expect(await api.put('/reportes/17', edit)).toEqual({ id: 17, ...edit });
  });
});

describe('Errores de red y respuestas inválidas', () => {
  it('HTTP 500 en reportes', async () => {
    server.use(http.get(`${base}/reportes`, () => HttpResponse.json({ error: 'x' }, { status: 500 })));
    await expect(api.get(ENDPOINTS.REPORTES)).rejects.toSatisfy(isApiError('http', 500));
  });
  it('fallo de red se clasifica como network', async () => {
    server.use(http.get(`${base}/reportes`, () => HttpResponse.error()));
    await expect(api.get(ENDPOINTS.REPORTES)).rejects.toSatisfy(isApiError('network'));
  });
  it('JSON roto se clasifica como response', async () => {
    server.use(http.get(`${base}/reportes`, () => new HttpResponse('{broken', { headers: { 'Content-Type': 'application/json' } })));
    await expect(api.get(ENDPOINTS.REPORTES)).rejects.toSatisfy(isApiError('response'));
  });
  it('una petición detenida se aborta por tiempo de espera', async () => {
    server.use(http.get(`${base}/reportes`, async () => { await delay(300); return HttpResponse.json([]); }));
    const fast = new ApiService({ baseUrl: base, timeoutMs: 50 });
    await expect(fast.get(ENDPOINTS.REPORTES)).rejects.toSatisfy(isApiError('timeout'));
  });
  it('no permite rutas fuera del prefijo /api', async () => {
    await expect(api.get('/../admin')).rejects.toThrow(TypeError);
  });
  it('resuelve fotos contra el origen del servidor y rechaza protocolos peligrosos', () => {
    expect(api.resolveUrl('/photos/a.jpg')).toBe('https://lostnet.test/photos/a.jpg');
    expect(api.resolveUrl('javascript:alert(1)')).toBeNull();
  });
});
