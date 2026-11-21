# Arquitectura

El navegador entra a través de Caddy. Next.js sirve la interfaz. NestJS recibe REST y GraphQL, valida identidad y permisos, y transmite contenido desde un bucket privado. PostgreSQL mantiene el catálogo y los estados de operación a través de Prisma. Redis conserva trabajos de BullMQ. El worker comparte las capas de persistencia y almacenamiento, y ejecuta un trabajo a la vez en la configuración inicial.

## Módulos del backend

- `src/app.module.ts` compone los módulos. `src/main.ts` arranca HTTP y `src/http/setup.ts` configura validación, cookies y Swagger.
- `src/auth`, `src/files`, `src/shares`, `src/imports` y `src/health` agrupan los dominios HTTP. GraphQL vive en el módulo de archivos y usa el mismo servicio que REST.
- `src/database`, `src/storage` y `src/queue` exponen los proveedores compartidos mediante la inyección de NestJS. `prisma/` contiene el esquema, el cliente y las migraciones.
- `src/worker` es el punto de entrada independiente de BullMQ. Usa los adaptadores compartidos para procesar medios, importar y limpiar datos.

## Dominios e invariantes

- **Identidad.** La contraseña crea una sesión pendiente de cinco minutos. TOTP o un código de recuperación la convierten en una sesión nueva y verificada. Los secretos de TOTP se cifran con la clave del servidor y los tokens de sesión se almacenan como hashes.
- **Archivos.** El árbol se expresa con identificadores de carpeta. Una clave física independiente permite renombrar o mover sin reescribir el objeto. La papelera oculta un subárbol. El borrado permanente reclama la raíz antes de quitar objetos y metadatos.
- **Transferencias.** Una subida reserva cuota. Los bloques de 8 MiB residen en S3 hasta la finalización. La API confirma el tamaño y la existencia del objeto antes de publicar el registro. El worker limpia cancelaciones y subidas abandonadas después de 24 horas.
- **Invitados.** Un canje consume un uso y crea una sesión en la misma transacción. Cada consulta verifica que el elemento siga dentro del árbol y que el enlace siga vigente. Los derivados invitados llevan la referencia corta de la sesión y se eliminan al vencer.
- **Medios.** Las cargas llegan sin confiar en nombre o MIME. Sharp y FFmpeg comprueban que el decodificador reconozca el contenido antes de publicar derivados. El almacenamiento S3 original permanece privado. Los formatos ajenos al visor salen como adjuntos.
- **Importaciones.** El parser local prepara candidatos. El worker valida protocolo, DNS, dirección pública y redirecciones. La conexión usa una dirección ya comprobada. Los trabajos identifican cada archivo por ID y los archivos temporales se eliminan al finalizar. Los enlaces directos aceptan hasta 256 MiB.
- **Servicios externos.** DeepSeek recibe únicamente las URL seleccionadas, tras confirmación. Resend recibe el destinatario configurado y el texto mínimo de una alerta. Ninguno participa en la verificación de la cuenta.

## Operación

Los servicios internos usan una red de datos sin puertos publicados. La API y el worker requieren salida para los proveedores opcionales y las descargas remotas. La restricción de las solicitudes a destinos públicos se aplica en el descargador. Conserva las redes de Docker y el firewall del host como otra capa de control. La publicación en internet requiere una configuración de proxy distinta que exponga únicamente la superficie de invitado.
