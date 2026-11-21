# Nuvex

Drive personal para Ubuntu Server. Organiza archivos, explora fotos y videos, y comparte enlaces con códigos temporales. El acceso propietario usa contraseña y TOTP.

## Estructura

- `frontend/` contiene Next.js.
- `backend/src/` contiene los módulos de NestJS y el punto de entrada del worker BullMQ.
- `backend/prisma/` reúne el esquema, las migraciones y el cliente de PostgreSQL.
- `backend/docs/` documenta los contratos y la operación. Compose vive en `backend/`.

## Levantar el entorno

Requisitos: Docker con Compose v2. Para desarrollo instala Node 24, pnpm 10 y FFmpeg con FFprobe en el PATH.

1. Copia `backend/.env.example` a `backend/.env`. Genera una clave de aplicación con `openssl rand -base64 32` y dos contraseñas independientes con `openssl rand -hex 24`. Usa una contraseña hexadecimal para PostgreSQL, porque también forma parte de una URL de conexión.
2. En Ubuntu crea los directorios de trabajo del worker y de estado de respaldos según la [guía de operación](backend/docs/operations.md). Para desarrollo con procesos en el host esos directorios son opcionales.
3. Para el despliegue local con HTTPS, ejecuta:

   ```bash
   cd backend
   docker compose build
   docker compose up -d --wait db redis storage
   docker compose run --rm --no-deps api pnpm migrate
   docker compose up -d --no-build --wait
   docker compose run --rm api pnpm run owner
   ```

4. Instala la CA local de Caddy siguiendo la guía de operación. Abre `https://localhost`, inicia sesión, configura la app autenticadora y guarda los códigos de recuperación. Swagger está en `https://localhost/api/docs`.

### Desarrollo en el host

Usa `backend/.env` para desarrollo. Las credenciales deben coincidir con las de Compose. Para que NestJS se conecte desde el host, configura:

```dotenv
PUBLIC_ORIGIN=http://localhost:3000
DATABASE_URL=postgresql://nuvex:<POSTGRES_PASSWORD>@127.0.0.1:5432/nuvex
```

Sustituye `<POSTGRES_PASSWORD>` por el valor de `POSTGRES_PASSWORD` del mismo archivo. Deja los datos de desarrollo en un directorio separado de los del despliegue.

Desde la raíz, instala dependencias, levanta PostgreSQL, Redis y SeaweedFS, y aplica las migraciones:

```bash
pnpm install --frozen-lockfile
pnpm dev:infra
pnpm migrate
```

Abre terminales separadas en la raíz. También puedes ejecutar `pnpm dev` desde `frontend/` y `pnpm start:dev` desde `backend/`.

| Terminal | Comando | Servicio |
| --- | --- | --- |
| Frontend | `pnpm dev` | Next.js en `http://localhost:3000` |
| Backend | `pnpm start:dev` | NestJS en `http://127.0.0.1:3001`, con reinicio al guardar |
| Worker, cuando pruebes medios o importaciones | `pnpm start:worker:dev` | Procesa la cola con Redis. Inícialo después de la primera compilación del backend. |

Crea la cuenta local una vez con `pnpm run owner` después de la primera compilación de NestJS. Swagger está en `http://localhost:3000/api/docs`. Si cambias el esquema Prisma, crea o aplica la migración de desarrollo y reinicia `pnpm start:dev` para regenerar el cliente.

`pnpm dev:infra:stop` detiene PostgreSQL, Redis y SeaweedFS y conserva sus datos.

## Verificación y documentación

- `pnpm lint`, `pnpm typecheck`, `pnpm build` y `pnpm test`.
- `pnpm openapi` genera y verifica el documento REST. `pnpm test:e2e` requiere la infraestructura de pruebas y Chromium.
- [Contratos HTTP y GraphQL](backend/docs/api.md), [arquitectura](backend/docs/architecture.md), [despliegue y recuperación](backend/docs/operations.md) y [convenciones de desarrollo](AGENTS.md).
