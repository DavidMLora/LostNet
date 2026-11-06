# Arquitectura base de LostNet

Astro genera dos páginas estáticas. `/` inicia el flujo de Google Identity Services y `/dashboard/` aloja el panel inicial. Ambos módulos se ejecutan en el navegador.

| Pieza | Responsabilidad |
| --- | --- |
| `src/layouts/Layout.astro` y `src/components/Brand.astro` | Documento base, estilos comunes e identidad visual. |
| `src/pages/index.astro` | Estados del acceso, montaje del botón y navegación. |
| `src/scripts/auth.js` | Carga del SDK oficial, botón de Google y lectura de los claims del ID token que devuelve su callback. |
| `src/scripts/session.js` | Escritura, lectura, caducidad y cierre de la sesión de interfaz. |
| `src/pages/dashboard.astro` | Mantiene oculto el panel hasta confirmar la sesión local. Expone `#map-module` para la integración posterior. |
| `src/scripts/config.js` | Configuración pública común de Google y del prefijo REST. |
| `src/scripts/api.js` | Transporte HTTP compartido y rutas REST conocidas. |

## Flujo de CU-01

1. El acceso inicializa Google Identity Services con el ID del cliente web y un nonce generado por página. El SDK dibuja su propio botón.
2. El callback lee los claims y comprueba que el emisor declarado, la audiencia, el nonce, el vencimiento y los datos básicos sean coherentes. La interfaz conserva solo `sub`, correo, nombre y metadatos de vigencia en `sessionStorage`.
3. Tras guardar la sesión, el navegador abre el panel. La vista se oculta y vuelve al acceso si el registro local falta o caduca. Una recarga en la misma pestaña conserva la sesión vigente.
4. Cerrar sesión borra el registro de LostNet de esa pestaña y vuelve al inicio. La cuenta de Google sigue disponible para iniciar otra sesión.

## Límite de confianza

La lectura de claims carece de verificación criptográfica. El estado del navegador es modificable y el HTML estático del panel es público. La restricción del panel controla la navegación de la interfaz. Las claves antiguas `user_email` y `user_id` de `localStorage` quedan fuera de la comprobación de sesión.

En el flujo de referencia de LostNetWEB, el callback de Google guarda el perfil en el navegador y las solicitudes REST observadas usan datos como `user_id` o correo. El código consultado carece de un intercambio de credencial con el servidor. La verificación real de identidad y la autorización de cada operación requieren un mecanismo confirmado por el backend. Los módulos deben tratar `user_id` como dato del contrato REST y los permisos como una decisión del servidor.

La sesión local expira con el ID token. El token se procesa en memoria durante el callback y se descarta. Las operaciones REST de esta fase conservan el transporte del contrato observado. [Verificación de ID tokens en Google Identity Services](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)

## Reparto de módulos

- Mapa. Monta el módulo en `#map-module` y publica la ubicación elegida según los contratos.
- Publicación. Consume la ubicación elegida y la sesión vigente, envía el multipart y avisa tras confirmar la creación.
- Mis reportes. Consulta el listado existente, aplica el filtro de propiedad y publica el cambio cuando se confirma una eliminación.
- Pruebas e integración continua. Amplía las pruebas aisladas conforme existan los módulos y define el pipeline del equipo.

Los puntos de integración están en [Contratos de módulos](CONTRATOS_MODULOS.md).
