# LostNet en local

Requisitos probados: Node.js 24.16.0, npm 11.13.0 y Git. Si usas un gestor compatible con `.nvmrc`, selecciona esa versión de Node.

## Clonar y arrancar

Una vez guardada la fase en el remoto, cada integrante puede ejecutar lo siguiente. Si ya tienes el repositorio, comienza en `npm ci` desde su raíz.

```powershell
git clone https://github.com/DavidMLora/LostNet.git
cd LostNet
npm ci
if (!(Test-Path -LiteralPath .env)) { Copy-Item .env.example .env }
npm run dev
```

Crea `.env` con el comando anterior si aún no existe. Si ya lo tienes, incorpora las variables manualmente. Abre la URL que imprime Astro, normalmente `http://localhost:4321/`. Si Astro elige otro puerto, registra ese origen o arranca con un puerto autorizado disponible. Para probar la salida estática usa `npm run build` y `npm run preview`. Las pruebas aisladas se ejecutan con `npm test`.

| Variable | Valor y uso |
| --- | --- |
| `PUBLIC_GOOGLE_CLIENT_ID` | Copia el ID del cliente OAuth web de `.env.example`. La interfaz indica cuándo falta. |
| `PUBLIC_API_BASE_URL` | URL completa con el prefijo REST. El valor predeterminado es `https://lostnet-api.tail0e8b19.ts.net/api`. |

Astro incorpora estas variables públicas al bundle. Reinicia el servidor de desarrollo tras cambiarlas y recompila para publicar con valores nuevos. El flujo usa el ID público del cliente web; el Client Secret queda fuera de esta configuración.

## Orígenes de Google Identity Services

1. Abre **Google Auth Platform → Clientes** en el proyecto de Google Cloud que administra el OAuth de LostNet.
2. Localiza el ID de `.env.example` y confirma que el tipo sea **Aplicación web**.
3. En **Orígenes autorizados de JavaScript**, agrega `http://localhost` y el origen local exacto, por ejemplo `http://localhost:4321`. Si la URL usa otro host o puerto, agrega ese origen. Usa esquema, host y puerto cuando corresponda, sin ruta.
4. Si la audiencia externa está en modo de prueba, añade la cuenta autorizada en **Audiencia → Usuarios de prueba**. Comprueba el flujo desde la URL registrada.

Esta integración recibe el resultado mediante el callback JavaScript de la ventana emergente. La guía oficial describe los orígenes y las opciones de política de contenido y de ventanas emergentes. [Configuración de Google Identity Services para la web](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)

## Cloudflare

Para una publicación futura, se puede crear un Worker independiente llamado `lostnetweb-mvp-demo` y servir el directorio `dist/` con Workers Static Assets. Configura las variables públicas en el entorno que ejecute `npm run build` y comprueba las rutas `/` y `/dashboard/`. Registra el origen HTTPS exacto asignado al Worker en el mismo cliente web de Google Cloud. Si el sitio usa un dominio propio, registra ese origen también. La API necesita aceptar el origen de la demo para las solicitudes del navegador. [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/)

## Comprobación de la API

Para revisar conectividad y CORS, realiza un GET de lectura a `/api/reportes` con el encabezado `Origin` de la página. Tras obtener una respuesta HTTPS válida, comprueba `Access-Control-Allow-Origin` y verifica desde el navegador las solicitudes que requieren preflight, como DELETE o POST con JSON. Durante esta fase, la conexión al host de referencia se interrumpió antes de recibir una respuesta HTTP, por lo que CORS y las respuestas del servidor quedaron pendientes de confirmación.
