import { createServer } from 'node:http';

const PORT = Number(process.env.LOSTNET_MOCK_API_PORT || 4322);
const ALLOWED_ORIGINS = new Set([
  'http://127.0.0.1:4321',
  'http://localhost:4321',
]);

const reports = new Map();
const photos = new Map();
let nextId = 1;

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

function applyCors(request, response) {
  const origin = request.headers.origin;
  response.setHeader('Vary', 'Origin');
  if (ALLOWED_ORIGINS.has(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}

async function readFormData(request) {
  const formRequest = new Request(`http://127.0.0.1:${PORT}${request.url}`, {
    method: request.method,
    headers: request.headers,
    body: request,
    duplex: 'half',
  });
  return formRequest.formData();
}

async function requestJson(request) {
  let body = '';
  for await (const chunk of request) body += chunk;
  return JSON.parse(body || '{}');
}

async function handleRequest(request, response) {
  applyCors(request, response);
  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url, `http://127.0.0.1:${PORT}`);
  if (url.pathname === '/api/reportes' && request.method === 'GET') {
    sendJson(response, 200, [...reports.values()]);
    return;
  }
  if (url.pathname === '/api/puntos-seguros' && request.method === 'GET') {
    sendJson(response, 200, []);
    return;
  }

  const photoMatch = url.pathname.match(/^\/api\/photos\/(\d+)$/);
  if (photoMatch && request.method === 'GET') {
    const photo = photos.get(photoMatch[1]);
    if (!photo) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': photo.contentType,
      'Cache-Control': 'no-store',
    });
    response.end(photo.bytes);
    return;
  }

  if (url.pathname === '/api/reportar' && request.method === 'POST') {
    try {
      const form = await readFormData(request);
      const userId = String(form.get('user_id') || '').trim();
      const email = String(form.get('email') || '').trim();
      if (!userId || !email) {
        sendJson(response, 400, { error: 'Falta el propietario del reporte.' });
        return;
      }

      const id = String(nextId++);
      const upload = form.get('foto');
      let foto = null;
      if (upload && typeof upload.arrayBuffer === 'function' && upload.size > 0) {
        const contentType = upload.type || 'application/octet-stream';
        const bytes = Buffer.from(await upload.arrayBuffer());
        photos.set(id, { contentType, bytes });
        foto = `/api/photos/${id}`;
      }

      const report = {
        id,
        user_id: userId,
        email,
        title: String(form.get('title') || '').trim(),
        description: String(form.get('description') || '').trim(),
        category: String(form.get('category') || '').trim(),
        status: String(form.get('status') || form.get('type') || 'LOST').trim().toUpperCase(),
        latitude: Number(form.get('latitude')),
        longitude: Number(form.get('longitude')),
        timestamp: Number(form.get('timestamp')) || Math.floor(Date.now() / 1000),
        foto,
      };
      reports.set(id, report);
      sendJson(response, 201, { id });
    } catch {
      sendJson(response, 400, { error: 'No se pudo leer el formulario multipart.' });
    }
    return;
  }

  const reportMatch = url.pathname.match(/^\/api\/reportes\/(\d+)$/);
  if (reportMatch && request.method === 'PUT') {
    const id = reportMatch[1];
    const report = reports.get(id);
    if (!report) {
      sendJson(response, 404, { error: 'No se encontró el reporte.' });
      return;
    }
    try {
      const changes = await requestJson(request);
      if (changes.user_id !== report.user_id) {
        sendJson(response, 404, { error: 'No se encontró el reporte propio.' });
        return;
      }
      const updated = {
        ...report,
        title: String(changes.title || '').trim(),
        description: String(changes.description || '').trim(),
        category: String(changes.category || '').trim(),
        status: String(changes.status || changes.type || report.status).trim().toUpperCase(),
      };
      reports.set(id, updated);
      sendJson(response, 200, updated);
    } catch {
      sendJson(response, 400, { error: 'No se pudo leer la actualización JSON.' });
    }
    return;
  }

  if (reportMatch && request.method === 'DELETE') {
    const id = reportMatch[1];
    const report = reports.get(id);
    if (!report || url.searchParams.get('user_id') !== report.user_id) {
      sendJson(response, 404, { error: 'No se encontró el reporte propio.' });
      return;
    }
    reports.delete(id);
    photos.delete(id);
    response.writeHead(204);
    response.end();
    return;
  }

  sendJson(response, 404, { error: 'Ruta no disponible en la API simulada local.' });
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => sendJson(response, 500, {
    error: 'Error interno de la API simulada local.',
  }));
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`LostNet mock API running at http://127.0.0.1:${PORT}/api`);
  console.log('Los reportes y las fotos solo viven en memoria y se borran al detener este proceso.');
});
