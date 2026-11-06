# Contratos de módulos

Los contratos REST se contrastaron con `src/scripts/api.js`, `app.js`, `report-detail.js` y las pruebas de integración del checkout de LostNetWEB. Las formas de datos de esta guía corresponden al consumo observado. Los eventos entre módulos son convenciones de integración para el nuevo frontend.

## A. Sesión

Importa `getUser()`, `getUserId()` y `clearSession()` desde `src/scripts/session.js` usando la ruta relativa al módulo. Invoca los métodos en el navegador.

- `getUser()` devuelve `{ sub, email, name }` o `null`. El nombre puede estar vacío. Vuelve a consultar la sesión antes de publicar o eliminar.
- `getUserId()` devuelve `sub` o `null`. En el contrato REST de reportes, usa ese valor como `user_id`.
- `clearSession()` elimina el estado de interfaz. El panel actual lo invoca desde su botón y dirige al inicio cuando concluye. Si el navegador bloquea el almacenamiento, el cierre puede fallar y el panel muestra un mensaje.

La autorización del servidor sigue siendo necesaria para operaciones sensibles. Consulta [Arquitectura base](ARQUITECTURA_BASE.md).

## B. Cliente HTTP

Importa `api`, `ENDPOINTS` y `ApiError` desde `src/scripts/api.js`. Pasa rutas relativas al prefijo, como `ENDPOINTS.REPORTES`. El cliente añade `/api` mediante la URL base.

```js
const reportes = await api.get(ENDPOINTS.REPORTES);
const comentarios = await api.get(ENDPOINTS.COMENTARIOS_GET, { report_id: reportId });
const publicacion = await api.post(ENDPOINTS.REPORTAR, multipart);
const eliminacion = await api.delete(
  `${ENDPOINTS.REPORTES}/${encodeURIComponent(reportId)}`,
  { user_id: getUserId() },
);
```

- `get(ruta, params)` y `delete(ruta, params)` codifican los parámetros. GET incorpora `_t` para conservar el comportamiento de lectura de LostNetWEB.
- `post(ruta, objeto)` serializa el objeto como JSON. `post(ruta, formData)` transmite el multipart y deja al navegador definir `Content-Type` y su boundary. El tercer argumento opcional es `{ params }`.
- `put(ruta, objeto)` serializa actualizaciones como JSON; `put(ruta, formData)` transmite multipart sin fijar el boundary.
- Las promesas devuelven el JSON recibido o `null` en HTTP 204/205. `ApiError.code` distingue `http`, `network`, `timeout` y `response`. En errores HTTP, `status` contiene el código. CORS, TLS y problemas de conexión pueden aparecer como `network` en el navegador.
- Los tiempos predeterminados son 5 s en GET y DELETE, y 60 s en POST para admitir cargas. Conserva el borrador ante un fallo y evita duplicar un envío si su resultado quedó indeterminado por un problema de conexión.
- Para fotografías recibidas, `api.resolveUrl(path)` resuelve rutas relativas contra el origen de la API.

| Método y ruta | Contrato que consume LostNetWEB |
| --- | --- |
| GET `/api/reportes` | Listado. Campos usados incluyen `id`, propietario mediante `user_id` o `email`, `status`, `category`, descripción, coordenadas y foto cuando existe. |
| GET `/api/puntos-seguros` | Listado separado. La vista consume `id`, `nombre`, coordenadas y `horario` cuando está disponible. |
| GET `/api/config` | Configuración opcional del mapa mediante `colores_mapa`. |
| POST `/api/reportar` | Multipart según la sección D. |
| DELETE `/api/reportes/{id}` | Query `user_id` con el `sub` del usuario activo. |
| GET `/api/mis-alertas` | Query `email`. Corresponde a alertas. |
| GET `/api/contacto` | Query `user_id` del propietario. |
| GET `/api/comentarios` | Query `report_id`. |
| POST `/api/comentar` | JSON con `report_id`, `user_name` y `text`. |

Pendiente confirmar con el servidor el esquema exacto de las respuestas de escritura, las validaciones y permisos aplicados, los límites de archivos y la política CORS del nuevo origen. La referencia utiliza el resultado HTTP para decidir si actualiza la vista. Las pruebas simuladas de la referencia usan respuestas como `{ ok: true, id }` al crear y `{ ok: true }` al eliminar. Estos cuerpos sirven de fixtures.

## C. Mapa

El mapa se monta en `#map-module` y consume los reportes y puntos seguros de forma independiente. En reportes, la referencia acepta `latitude`/`longitude` o `lat`/`lon`. Las coordenadas cero son válidas. Distingue puntos seguros y reportes aunque compartan un identificador.

Usa estos eventos de `CustomEvent` en `document` para coordinar la integración:

| Evento | Emisor | Detalle y receptor |
| --- | --- | --- |
| `lostnet:map:pick-requested` | Formulario | Sin detalle. El mapa entra en modo selección. |
| `lostnet:map:location-selected` | Mapa | `{ latitude, longitude }` con números en grados. El formulario conserva el punto. |
| `lostnet:reports:changed` | Publicación o Mis reportes | `{ action: 'created' \| 'updated' \| 'deleted', reportId? }`. El mapa actualiza los reportes y las vistas de listado pueden refrescarse. |

El mapa emite la ubicación solo durante una selección solicitada. El formulario valida latitud en `[-90, 90]` y longitud en `[-180, 180]` antes de publicar. Por ejemplo:

```js
document.dispatchEvent(new CustomEvent('lostnet:map:location-selected', {
  detail: { latitude, longitude },
}));
```

## D. Reportes

Para `POST /api/reportar`, el formulario construye un `FormData` con estos nombres exactos:

| Campo | Valor |
| --- | --- |
| `user_id`, `email` | `user.sub` y `user.email` de la sesión actual. |
| `description`, `category` | Descripción y categoría elegida. La web de referencia exige una descripción y limita su longitud a 30 caracteres. |
| `phone`, `security_question`, `security_answer` | Datos de contacto y seguridad. La web envía cadenas vacías cuando se omiten. |
| `latitude`, `longitude` | Coordenadas seleccionadas, como cadenas decimales. |
| `status` | `LOST` o `FOUND`. El valor inicial de referencia es `LOST`. |
| `timestamp` | Segundos Unix, `String(Math.floor(Date.now() / 1000))`. |
| `foto` | Objeto `File` de la fotografía. La interfaz de referencia exige una foto. |

```js
multipart.set('foto', photo);
const result = await api.post(ENDPOINTS.REPORTAR, multipart);
document.dispatchEvent(new CustomEvent('lostnet:reports:changed', {
  detail: { action: 'created', reportId: result?.id },
}));
```

Emite el evento después de que la publicación se confirme. `reportId` es opcional al crear porque el cuerpo real queda por confirmar. El mapa y el listado deben poder recargar desde GET sin depender de ese valor. Maneja el error antes de mostrar confirmación.

## E. Mis reportes

1. Consulta `GET /api/reportes`. LostNetWEB aplica el filtro de propiedad en el cliente sobre ese listado.
2. Conserva los registros cuyo propietario, `report.user_id || report.email`, coincide con `user.sub` o `user.email`. La coincidencia organiza la vista y el servidor decide los permisos efectivos.
3. Tras confirmar la acción con el usuario, usa el ID real del reporte en `DELETE /api/reportes/{id}?user_id={sub}`. No uses el índice de un listado como identificador.
4. Tras el éxito, retira el registro de la vista y emite `lostnet:reports:changed` con `{ action: 'deleted', reportId }`. Ante error, conserva el registro o vuelve a consultar el listado y muestra el resultado.
5. La edición envía `PUT /api/reportes/{id}` con `user_id`, `email`, `title`, `description`, `category`, `status` y `type`. Tras el éxito emite `lostnet:reports:changed` con `action: 'updated'` para recargar listado y mapa.

> El backend de referencia no documenta todavía un endpoint de actualización. `PUT /api/reportes/{id}` queda como contrato propuesto para integrar CU-10; la API simulada local sí lo implementa. Confirma o adapta este método con el responsable del backend antes de usar edición en producción.
