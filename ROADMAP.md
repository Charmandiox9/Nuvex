# ROADMAP · Nuvex

Plan de trabajo pendiente, por prioridad. Fuente de verdad del orden de entrega. Mantén las casillas al día.

Principios para todo el plan (según `AGENTS.md`):
- **Ponytail**: mínimo cambio completo; reutilizar lo existente; no añadir dependencias sin justificar; nunca recortar validación/seguridad.
- **Un cambio lógico por commit**, claro y explicado.
- **Definición de hecho por entrega**: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (+ `pnpm test:e2e` si toca flujos), docs (`backend/docs/api.md`, Swagger), claves i18n es/en y tests de la lógica no trivial.

## Fase 0 · Preparación
- [x] Verificar línea base: `pnpm dev:infra`, `pnpm migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- [x] Establecer commits base por área (`chore`, `feat(backend)`, `feat(web)`, `docs`). A partir de aquí, un commit por feature.
- [ ] Crear rama por entrega (`feat/...`) al iniciar la Fase 1.

## Fase 1 · Prioridad alta

### 1. Gestión de cuenta del propietario — seguridad
**Objetivo:** cambiar contraseña, re‑enrolar/reiniciar TOTP, regenerar códigos de recuperación y desactivar 2FA, con re‑autenticación.
- [x] Backend: `POST /auth/password` (rota hash, revoca otras sesiones, audita).
- [x] Backend: `POST /auth/totp/enroll` + `POST /auth/totp/confirm` (nuevo secreto + códigos).
- [x] Backend: `POST /auth/recovery/regenerate`.
- [x] Backend: `POST /auth/2fa/disable` (contraseña + código) y `POST /auth/sessions/revoke-all`.
- [x] Frontend: panel «Seguridad» en Ajustes (cambio de contraseña, re‑enrolar TOTP, regenerar códigos, desactivar 2FA).
- [x] Tests: integración de endpoints y e2e de navegador del cambio de contraseña. Sin migración.

### 2. Visor de medios tipo lightbox — impacto visual
- [x] Frontend: `components/media-viewer.tsx` (lista + índice; ←/→, `Esc`, swipe, zoom).
- [x] Integrar en galería y en el explorador (navegación dentro de los medios cargados).
- [x] Paginar el visor cerca del final.
- [ ] Tests: e2e del visor (requiere el worker en el harness para procesar medios). Sin cambios de backend.

### 3. Descarga de carpeta (ZIP)
- [x] Backend: `GET /entries/:id/archive` (streaming, exclusión de papelera, límite de entradas, solo `ownerId`).
- [x] Frontend: acción «Descargar carpeta».
- [x] Tests: integración (contenido ZIP y rechazo de archivos). Sin migración. (e2e pendiente.)

### 4. Subidas concurrentes
- [x] Frontend: pool de 3 subidas en `hooks/use-transfers.ts`, partes secuenciales por archivo, reanudación preservada y deduplicación de carpetas.
- [x] Verificado con e2e de subida (escritorio y móvil). Unitario del planificador pendiente (se cubre en la Fase 3.10).

## Fase 2 · Prioridad media

### 5. Filtros y búsqueda avanzada
- [x] GraphQL `entries`: `kind`, `mimePrefix`, `minSize`, `maxSize`, `from`, `to` (validados).
- [x] UI: filtros de tipo, fecha y tamaño; al filtrar o buscar, se consulta toda la unidad.
- [x] Tests de integración de filtros. Sin migración.

### 6. Soporte de audio
- [x] Backend: `audio/*` se sirve inline en `mode=preview` (propietario e invitado).
- [x] Frontend: reproductor `<audio>` en el visor e icono de audio.
- [x] Tests de integración (propietario e invitado). Sin migración.

### 7. Enlaces compartidos
- [x] QR del enlace en la creación (`qr` data URL).
- [x] `POST /shares/:id/send` `{ to, code }` con Resend (valida el código; 503 si no está configurado).
- [x] Tests de integración. Sin migración. (Envío real no probado: requiere Resend configurado.)
- [ ] Tope de descargas por enlace (opcional, pendiente).

### 8. Errores del backend en inglés
- [x] `code` estable en errores clave (auth, archivos, enlaces) vía `AppException`.
- [x] Frontend localiza por `code` (es/en) con fallback al `message`.
- [x] Test de integración de códigos. (Algunos errores aún sin `code`; el fallback los cubre.)

### 9. PWA + arrastrar carpetas del sistema
- [ ] `manifest`, iconos y service worker mínimo (usar `modern-web-guidance`).
- [ ] Drop de carpetas vía `webkitGetAsEntry`, acotando profundidad/tamaño.

## Fase 3 · Calidad e infraestructura

### 10. Pruebas unitarias
- [ ] Backend: `common/security`, `imports/import-urls`, `file-entry`.
- [ ] Frontend: Vitest para `lib/format`, i18n `t`, planificador de subidas; añadir al CI.

### 11. Vista de auditoría
- [ ] `GET /audit` paginado (owner) y panel en Ajustes.

### 12. Observabilidad
- [ ] Logs estructurados con redacción de secretos, IDs de petición y `/health` profundo (DB/S3/Redis).

## Orden recomendado
1. Fase 0.
2. Cuenta → Lightbox → ZIP → Subidas concurrentes.
3. Fase 2: 5 → 6 → 7 → 8 → 9.
4. Fase 3: 10 (junto a cada feature) → 11 → 12.
