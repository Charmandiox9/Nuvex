# ROADMAP · Nuvex

Plan de trabajo pendiente, por prioridad. Fuente de verdad del orden de entrega. Mantén las casillas al día.

Principios para todo el plan (según `AGENTS.md`):
- **Ponytail**: mínimo cambio completo; reutilizar lo existente; no añadir dependencias sin justificar; nunca recortar validación/seguridad.
- **Un cambio lógico por commit**, claro y explicado.
- **Definición de hecho por entrega**: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` (+ `pnpm test:e2e` si toca flujos), docs (`backend/docs/api.md`, Swagger), claves i18n es/en y tests de la lógica no trivial.

## Fase 0 · Preparación
- [ ] Verificar línea base: `pnpm dev:infra`, `pnpm migrate`, `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`.
- [ ] Establecer commits base (el repo parte con un commit inicial vacío). Los commits base son por área (no por feature retroactivo, porque el código ya estaba construido); a partir de aquí, un commit por feature.
- [ ] Crear rama por entrega (`feat/...`).

## Fase 1 · Prioridad alta

### 1. Gestión de cuenta del propietario — seguridad
**Objetivo:** cambiar contraseña, re‑enrolar/reiniciar TOTP, regenerar códigos de recuperación y desactivar 2FA, con re‑autenticación.
- [ ] Backend: `POST /auth/password` (rota hash, revoca otras sesiones, audita).
- [ ] Backend: `POST /auth/totp/enroll` + `POST /auth/totp/confirm` (nuevo secreto + códigos).
- [ ] Backend: `POST /auth/recovery/regenerate`.
- [ ] Backend: `POST /auth/2fa/disable` (contraseña + código) y `POST /auth/sessions/revoke-all`.
- [ ] Frontend: panel «Seguridad» en Ajustes (cambio de contraseña, re‑enrolar TOTP, regenerar códigos, desactivar 2FA).
- [ ] Tests: integración de endpoints y e2e de cambio de contraseña. Sin migración.

### 2. Visor de medios tipo lightbox — impacto visual
- [ ] Frontend: `components/media-viewer.tsx` (lista + índice; ←/→, `Esc`, swipe, zoom, foco atrapado).
- [ ] Integrar en galería y preview del drive; paginar al llegar al final.
- [ ] Tests: e2e (abrir, avanzar, cerrar; teclado). Sin cambios de backend.

### 3. Descarga de carpeta (ZIP)
- [ ] Backend: `GET /entries/:id/archive` (streaming, exclusión de papelera, límites, solo `ownerId`).
- [ ] Frontend: acción «Descargar carpeta».
- [ ] Tests: integración del contenido del ZIP y e2e. Sin migración.

### 4. Subidas concurrentes
- [ ] Frontend: pool de 2–3 subidas en `hooks/use-transfers.ts`, partes secuenciales por archivo, mantener reanudación.
- [ ] Tests: unitario del planificador y prueba manual.

## Fase 2 · Prioridad media

### 5. Filtros y búsqueda avanzada
- [ ] GraphQL `entries`: `kind`, `mimePrefix`, `minSize`, `maxSize`, `from`, `to`.
- [ ] UI: chips de filtro y alternar «toda la unidad / esta carpeta».

### 6. Soporte de audio
- [ ] Backend: servir `audio/*` en `mode=preview` inline (contenido propio e invitado).
- [ ] Frontend: reproductor `<audio>` en el visor.

### 7. Enlaces compartidos
- [ ] `POST /shares/:id/send` (Resend) y QR del enlace; opcional tope de descargas.

### 8. Errores del backend en inglés
- [ ] Añadir `code` estable a errores clave y mapearlo en el frontend (fallback al `message`).

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
