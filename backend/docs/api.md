# API de Nuvex

Swagger UI está en `/api/docs`. El documento generado está en `/api/docs-json` y se puede exportar con `pnpm openapi`. Mantén ambos en la red privada. REST vive en `/api/v1`. Los errores HTTP incluyen `statusCode`, `message` y, en los casos clave, un `code` estable traducible. Un conflicto por nombre puede incluir `suggestedName`.

## Cuenta, transferencias y enlaces

- **Cuenta.** `POST /auth/login` recibe usuario y contraseña. Si devuelve `enroll`, usa el QR o la clave manual. `POST /auth/totp` y `POST /auth/recovery` reciben `{ "code": "…" }` y rotan la cookie. `GET /auth/me` exige una sesión verificada.
- **Gestión de cuenta.** Con sesión verificada y la contraseña actual: `POST /auth/password` `{ currentPassword, newPassword }` rota la contraseña y revoca las demás sesiones; `POST /auth/recovery/regenerate` `{ currentPassword }` emite códigos nuevos; `POST /auth/totp/enroll` `{ currentPassword }` devuelve `qr` y `setupKey`, y `POST /auth/totp/confirm` `{ code }` activa el nuevo autenticador y devuelve códigos; `POST /auth/2fa/disable` `{ currentPassword, code }` desactiva la verificación en dos pasos; `POST /auth/sessions/revoke-all` cierra todas las sesiones salvo la actual. La contraseña nueva debe tener 8–256 caracteres.
- **Protección de escrituras.** Las peticiones distintas de GET, HEAD y OPTIONS usan `X-Nuvex-Request: 1`. La API verifica `Origin` cuando está presente. Mantén la integración web en el mismo origen. Las cookies son HttpOnly y Secure en HTTPS.
- **Subidas.** Crea una sesión con `POST /uploads` incluyendo nombre, tamaño, MIME, huella y carpeta opcional. Consulta `GET /uploads/{id}` para descubrir bloques guardados. Envía cada parte con `PUT /uploads/{id}/parts/{number}`, `Content-Type: application/octet-stream` y su longitud. Finaliza con `POST /uploads/{id}/complete` y `{}`. `DELETE /uploads/{id}` cancela. El servidor acepta archivos de hasta 4 GiB y una cuota inicial de 100 GiB.
- **Contenido.** `GET /entries/{id}/content?mode=download` devuelve un adjunto. El modo `preview` sirve un formato apto para reproducción. Para audio, `preview` sirve el archivo original en línea. Una petición `Range: bytes=0-1023` devuelve 206 con `Content-Range`. Un rango inválido devuelve 416.
- **Carpetas.** `GET /entries/{id}/archive` descarga una carpeta completa como ZIP en streaming (excluye la papelera; solo el propietario). Un archivo devuelve 400.
- **Enlaces.** `POST /shares` recibe `entryId`, `hours`, `uses` y `allowDownload`. El código en claro y un QR (data URL) se devuelven al crear el enlace. `POST /shares/{id}/send` `{ to, code }` envía el enlace y el código por email con Resend; devuelve 503 si no está configurado. `POST /guest/{shareId}/redeem` crea la sesión de invitado. `GET /guest/{shareId}` lista el elemento y los hijos autorizados. Solicita la preparación con `POST /guest/{shareId}/preview/{id}` y lee el resultado desde `GET /guest/{shareId}/content/{id}`.

## GraphQL privado

En `POST /graphql`, incluye la cookie verificada, el encabezado de seguridad y un cuerpo JSON con `query` y `variables`. El esquema se genera desde los resolvers de NestJS. La raíz de carpetas usa una cadena vacía como `parentId`. El cursor devuelto por la API se pasa a la siguiente consulta. `size` es una cadena decimal.

```graphql
query Files($parent: String!, $cursor: String) {
  entries(view: "files", parentId: $parent, cursor: $cursor, sort: "name") {
    items { id name kind mime size updatedAt mediaStatus }
    nextCursor
  }
}
```

Usa `view: "gallery"` para medios y `view: "trash"` para la papelera. El argumento opcional `search` busca por nombre. Filtros opcionales: `kind` (`file` o `folder`), `mimePrefix`, `minSize`/`maxSize` (bytes como cadena decimal) y `from`/`to` (ISO sobre `updatedAt`). Con `search` o cualquier filtro, la consulta se hace sobre toda la unidad.
