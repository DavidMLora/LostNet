# Pruebas e integración continua

Responsable: gestor de calidad (componente 5 · rama `feature/pruebas-ci-documentacion`).

## Cifras

| Tipo | Archivo | Casos | Qué cubre |
| --- | --- | --- | --- |
| Unitarias | `tests/unit/session.test.js` | 7 | CU-01: sesión local y lectura de la credencial de Google |
| Unitarias | `tests/unit/api-client.test.js` | 9 | Cliente HTTP: GET/POST/PUT/DELETE, errores, tiempo de espera y prefijo `/api` |
| Unitarias | `tests/unit/map-filters.test.js` | 7 | CU-14: filtros por categoría y búsqueda |
| Unitarias | `tests/unit/report-form.test.js` | 13 | CU-03 / CU-07: validación, coordenadas y multipart |
| Unitarias | `tests/unit/my-reports.test.js` | 2 | CU-10: propiedad de los reportes |
| Unitarias | `tests/unit/ci-policy.test.js` | 18 | Reglas del workflow de GitHub Actions |
| Integración | `tests/integration/api.test.js` | 17 | Contratos REST simulados con MSW por caso de uso |
| **Total** | | **73** | |

Las pruebas de integración usan el dominio reservado `lostnet.test`; ninguna toca el servidor real y cualquier petición sin manejador hace fallar la prueba.

## Comandos

```bash
npm ci
npm run lint              # ESLint sin advertencias
npm run check:ci          # valida el workflow sin ejecutarlo
npm run test:unit         # 56 casos
npm run test:integration  # 17 casos
npm run build && npm run check:build
docker build -t lostnet:ci . && bash scripts/smoke-container.sh lostnet:ci
```

Requiere Node 24.16.0 (`.nvmrc`). Con Node 22.22.0 la compilación de Astro 7.4.5 falla.

## Pipeline (`.github/workflows/ci.yml`)

Se ejecuta en `push` a `main` o `develop`, en `pull_request` hacia esas ramas y manualmente.

| Job | Qué hace | Depende de |
| --- | --- | --- |
| `analisis-estatico` | `npm run lint` y `npm run check:ci` | — |
| `vulnerabilidades` | `npm audit --audit-level=high` (bloquea altas y críticas) | — |
| `pruebas-unitarias` | `npm run test:unit` | — |
| `pruebas-integracion` | `npm run test:integration` | pruebas-unitarias |
| `empaquetado` | build, `check:build`, imagen Docker sin publicar y smoke test de nginx | los cuatro anteriores |
| `publicar` | publica la imagen en GHCR (`sha-<commit>` y `latest`) | empaquetado; solo en `push` a `main` del repositorio original |

Las acciones están fijadas por SHA y los permisos son de solo lectura salvo `packages: write` en `publicar`.

## Evidencias

Para cada pull request se guarda la captura de la pestaña **Checks** con los seis jobs y el resumen de Vitest. Los defectos encontrados se anotan en el registro PSP del responsable del componente.
