# Nuvex

Drive personal autoalojado para Ubuntu Server. Organiza archivos y carpetas, explora fotos, videos y audio, y comparte elementos con enlaces y códigos temporales. El propietario accede con contraseña y verificación en dos pasos (TOTP); los invitados solo ven lo que su enlace autoriza.

Conserva los originales, genera derivados para navegar y reproducir, y mantén los datos en un volumen cifrado.

## Características

**Archivos y carpetas**
- Árbol de carpetas con **icono personalizado** (imagen propia).
- Subidas por bloques, reanudables y **concurrentes**; arrastrar y soltar archivos y **carpetas del sistema**.
- Mover, copiar, renombrar, restaurar y borrar; papelera con **purga automática a los 30 días**.
- Búsqueda global por nombre y **filtros** por tipo, fecha y tamaño.
- Vista de lista y de cuadrícula; descarga de una carpeta completa en **ZIP**.

**Medios**
- Miniaturas y vista previa de imágenes; póster y reproducción de video (transcodificación y streaming por rangos).
- Compresión reversible de JPEG en el servidor cuando ahorra espacio. Las descargas reconstruyen el `.jpg` original byte por byte.
- Reproductor de audio.
- **Visor a pantalla completa** (galería): siguiente/anterior, teclado, swipe, zoom y descarga.

**Compartir**
- Enlaces para invitados con **código**, vencimiento, canjes limitados, permiso de descarga y **tope de descargas**.
- **QR** del enlace y envío por **email** (Resend, opcional).
- Derivados de invitado con **marca de agua** y limpieza al vencer.

**Importaciones**
- Importación desde URLs a partir de un JSON, con protección **SSRF** y **sugerencias de nombre/categoría con DeepSeek** (opcional).

**Seguridad y plataforma**
- Contraseña (Argon2) + **TOTP** y códigos de recuperación; gestión de cuenta (cambiar contraseña, re‑enrolar TOTP, regenerar códigos, desactivar 2FA, cerrar sesiones).
- Rate limiting, cookies HttpOnly, cabecera anti‑CSRF y comprobación de `Origin`.
- **Auditoría** de la actividad, **health** profundo (PostgreSQL/Redis/S3) y logs estructurados opcionales.
- **i18n** español/inglés, **tema claro/oscuro**, **PWA** instalable. App privada (`noindex`).

## Stack

- **Frontend**: Next.js 16 (App Router), React 19, TypeScript estricto, Tailwind v4 + tokens CSS, TanStack Query, Anime.js, Three.js, Sileo, lucide-react.
- **Backend**: NestJS 11, Prisma 7, PostgreSQL 17, BullMQ + Redis 7, SeaweedFS (S3), sharp y FFmpeg, GraphQL (lectura) y REST bajo `/api/v1`.
- **Infra**: Docker Compose, Caddy (proxy inverso con TLS local), volumen LUKS para datos, respaldos con Restic.
- **Pruebas**: Jest e integración (backend), Vitest (frontend), Playwright (e2e).

## Arquitectura

```
Navegador ──HTTPS──> Caddy ──┬─> web  (Next.js :3000)
                             └─> api  (NestJS :3001) ──> PostgreSQL · Redis · SeaweedFS (S3)
                                        worker (BullMQ) ──> medios · importaciones · limpieza
```

El navegador solo habla con Caddy. La API valida identidad y permisos y sirve el contenido desde un bucket privado. El worker comparte las capas de persistencia y almacenamiento y procesa trabajos en segundo plano. Detalle en [`backend/docs/architecture.md`](backend/docs/architecture.md).

## Requisitos

- Docker con Compose v2 (producción y desarrollo con contenedores).
- Para desarrollo en el host: **Node 24**, **pnpm 10** y **FFmpeg/FFprobe** en el `PATH`.

## Puesta en marcha

### Docker (despliegue local con HTTPS)

1. Copia `backend/.env.example` a `backend/.env` y genera los secretos:
   - Clave de aplicación: `openssl rand -base64 32` → `NUVEX_SECRET`.
   - Dos contraseñas independientes: `openssl rand -hex 24`. Usa formato **hexadecimal** para PostgreSQL (`POSTGRES_PASSWORD`), porque forma parte de una URL de conexión.
2. En Ubuntu crea los directorios de trabajo del worker y de estado de respaldos según la [guía de operación](backend/docs/operations.md).
3. Construye y arranca:
   ```bash
   cd backend
   docker compose build
   docker compose up -d --wait db redis storage
   docker compose run --rm --no-deps api pnpm migrate
   docker compose up -d --no-build --wait
   docker compose run --rm api pnpm run owner
   ```
4. Instala la CA local de Caddy (ver [operación](backend/docs/operations.md)) y abre `https://localhost`. Swagger: `https://localhost/api/docs`.

### Desarrollo en el host

Usa `backend/.env` con las mismas credenciales que Compose y apunta la API al host:

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://nuvex:<POSTGRES_PASSWORD>@127.0.0.1:5432/nuvex
```

Desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm dev:infra      # PostgreSQL, Redis y SeaweedFS en Docker
pnpm migrate        # aplica migraciones
```

En terminales separadas (todas desde la raíz):

| Terminal | Comando | Servicio |
| --- | --- | --- |
| Frontend | `pnpm dev` | Next.js en `http://localhost:3000` |
| Backend | `pnpm start:dev` | NestJS en `http://127.0.0.1:3001` (reinicio al guardar) |
| Worker | `pnpm start:worker:dev` | Procesa medios e importaciones (tras la primera compilación) |

Crea la cuenta una vez con `pnpm run owner` (terminal interactiva). Swagger: `http://localhost:3000/api/docs`. `pnpm dev:infra:stop` detiene la infraestructura conservando los datos.

> `pnpm owner` choca con el comando `owner` de npm; usa siempre `pnpm run owner`.

## Configuración

Variables en `backend/.env` (ver `backend/.env.example`):

| Variable | Descripción |
| --- | --- |
| `NUVEX_HOST` | Nombre del host para Caddy/TLS en la LAN. |
| `PUBLIC_ORIGIN` | Origen público de la web (`https://<host>`); se usa en cookies y comprobación de `Origin`. |
| `NUVEX_BIND` / `NUVEX_HTTPS_PORT` | Interfaz y puerto publicados por Caddy (por defecto `127.0.0.1:443`). |
| `NUVEX_DATA` | Directorio de datos persistentes (volumen cifrado). |
| `NUVEX_BACKUP_STATE` | Estado del respaldo nocturno. |
| `NUVEX_SECRET` | Clave base64 de 32 bytes para sellar secretos (TOTP, etc.). |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL (hexadecimal). |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Credenciales del S3 de SeaweedFS. |
| `NUVEX_QUOTA_BYTES` | Cuota de almacenamiento (por defecto 100 GiB). |
| `DEEPSEEK_MODEL` | Modelo de sugerencias; la clave se guarda en Ajustes. |
| `NUVEX_LOG_JSON` | `1` activa logs JSON estructurados (por defecto, legibles). |
| `RESEND_API_KEY` / `NUVEX_ALERT_FROM` / `NUVEX_ALERT_TO` | Alertas y envío de enlaces por email (opcional). |

## Scripts

Desde la raíz:

| Comando | Qué hace |
| --- | --- |
| `pnpm dev` | Frontend Next.js en desarrollo. |
| `pnpm start:dev` | Backend NestJS con recarga. |
| `pnpm start:worker:dev` | Worker BullMQ en desarrollo. |
| `pnpm dev:infra` / `pnpm dev:infra:stop` | Levanta/detiene PostgreSQL, Redis y SeaweedFS. |
| `pnpm generate` | Genera el cliente Prisma. |
| `pnpm migrate` | Aplica migraciones (`prisma migrate deploy`). |
| `pnpm run owner` | Crea la cuenta del propietario (interactivo). |
| `pnpm build` / `pnpm build:server` | Compila backend y/o frontend. |
| `pnpm start:api` / `pnpm start:worker` | Ejecuta la compilación de producción. |
| `pnpm openapi` | Genera y verifica el documento REST. |
| `pnpm lint` / `pnpm typecheck` | ESLint y TypeScript estricto. |
| `pnpm test` | Unitarias: Jest (backend) + Vitest (frontend). |
| `pnpm test:e2e` | Playwright (requiere infraestructura y Chromium). |

## Estructura

```
backend/
  src/            # NestJS: auth, files, shares, imports, audit, health,
                  # database, storage, queue, worker, common, http
  prisma/         # esquema, migraciones y cliente
  docs/           # API, arquitectura y operación
  infra/          # Caddyfile, respaldo (Restic) y unidades systemd
  compose.yaml · compose.dev.yaml · Dockerfile
frontend/
  src/
    app/          # rutas (Next.js App Router)
    components/   # UI reutilizable
    hooks/        # lógica de estado
    i18n/         # catálogos es/en y proveedor
    lib/          # cliente API, formato y utilidades
    graphql/      # consultas
    types/        # DTOs de la API
  public/         # manifest, service worker e iconos (PWA)
  DESIGN.md       # sistema de diseño
AGENTS.md         # convenciones de desarrollo
ROADMAP.md        # plan de trabajo por fases
```

## Pruebas y verificación

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test        # unitarias (backend + frontend)
pnpm test:e2e    # e2e (con PostgreSQL, Redis, SeaweedFS y Chromium)
```

Las pruebas de integración del backend usan `NUVEX_INTEGRATION=1` y servicios locales. Las e2e arrancan la API y la web y usan Chromium.

## Seguridad y datos

- Drive **privado**: metadatos `noindex`, `robots.txt` que bloquea el rastreo y acceso exclusivo del propietario o de un invitado autorizado.
- Mantén `NUVEX_DATA` sobre un **volumen LUKS** y `.env` con permisos restringidos. No confirmes credenciales ni archivos personales en el repositorio.
- Respaldos cifrados con **Restic** en un disco separado; ver la [guía de operación](backend/docs/operations.md) para crear, restaurar y verificar.
- Para exponerlo fuera de la LAN, mantenlo tras una VPN y un proxy que solo publique la superficie de invitado.

## Documentación

- [Contratos HTTP y GraphQL](backend/docs/api.md)
- [Arquitectura](backend/docs/architecture.md)
- [Despliegue y recuperación](backend/docs/operations.md)
- [Convenciones de desarrollo](AGENTS.md) · [Sistema de diseño](frontend/DESIGN.md) · [Roadmap](ROADMAP.md)

## Convenciones

- Un cambio lógico por commit, claro y explicado.
- Textos de interfaz con i18n (español por defecto e inglés), sin literales en JSX.
- Reutilizar componentes y servicios antes de crear nuevos («cambio mínimo completo»). Ver [`AGENTS.md`](AGENTS.md).
