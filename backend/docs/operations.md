# Operación en Ubuntu Server

Desde la raíz del repositorio, entra en `backend/` para ejecutar los comandos Docker Compose de esta guía.

## Preparar el PC

Registra CPU y RAM con `lscpu` y `free -h`, espacio con `lsblk -f` y `df -h`, y salud del disco con SMART cuando el dispositivo la exponga. Mide la red desde un segundo equipo, por ejemplo con una transferencia por cable. Anota las mediciones antes de fijar la cuota o habilitar más trabajos simultáneos.

Monta un volumen LUKS dedicado antes de iniciar Compose. Configura `NUVEX_DATA` sobre ese montaje y guarda `.env` con permisos de lectura restringidos. El montaje debe estar disponible al arrancar los contenedores. Si el volumen requiere desbloqueo manual, desbloquéalo y comprueba el punto de montaje antes de arrancar Nuvex. Un montaje ausente puede hacer que Docker escriba en el disco del sistema.

```bash
sudo install -d -m 0700 -o 1000 -g 1000 /srv/nuvex/data/media-work
sudo install -d -m 0755 /srv/nuvex/backup-state
```

Ajusta las rutas a `NUVEX_DATA` y `NUVEX_BACKUP_STATE`. El worker usa el UID 1000. Reserva espacio temporal para originales y derivados. Inicialmente deja la concurrencia del worker en uno.

## Red, arranque y actualizaciones

- Por defecto Caddy escucha en loopback. Para la red local asigna un nombre DNS interno al PC, configura `NUVEX_HOST`, `PUBLIC_ORIGIN=https://<nombre>` y deja `NUVEX_BIND` en la IP LAN del PC. Permite el puerto 443 solo desde la red autorizada.
- Extrae la CA con `docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./nuvex-local-ca.crt`. Instálala como autoridad de confianza únicamente en los dispositivos que usarán Nuvex. Conserva la clave privada de la CA dentro del volumen cifrado.
- Para actualizar con imágenes de GHCR, fija `NUVEX_API_IMAGE`, `NUVEX_WORKER_IMAGE` y `NUVEX_WEB_IMAGE` al mismo tag. Ejecuta el respaldo, descarga imágenes, aplica `docker compose run --rm --no-deps api pnpm migrate` y levanta con `docker compose up -d --no-build`. Comprueba `/api/v1/health`, un inicio de sesión y una descarga.
- Para revertir, vuelve al tag anterior si el esquema es compatible. Si la actualización cambió el esquema de forma incompatible, restaura el respaldo en una instalación separada, valida y conmuta el tráfico. Conserva ambas copias hasta verificar los datos.
- Cuando se publique en internet, mantén el drive en una VPN. El proxy público tendrá una lista explícita del visor y endpoints de invitado. Planea HTTPS, DNS, CGNAT y pruebas desde una red externa antes de publicar. El Caddyfile actual es de LAN.

## Copia nocturna

Instala Restic y prepara un repositorio cifrado en un disco físico separado. Monta el disco y fija `NUVEX_DATA`, `NUVEX_BACKUP_STATE`, `RESTIC_REPOSITORY` y `RESTIC_PASSWORD_FILE` en el entorno de la tarea. Guarda la contraseña y la clave de aplicación fuera de la copia principal y con acceso restringido. Programa `bash infra/backup.sh` cada noche mediante un temporizador de systemd o cron con acceso a Docker y a los volúmenes. El respaldo detiene el ingreso y el procesamiento brevemente, para mantener coherencia entre los objetos y el catálogo.

Para usar el temporizador incluido, guarda esas rutas absolutas en `/etc/nuvex/backup.env` con permisos `0600`. Con el repo en `/opt/nuvex`, copia `backend/infra/nuvex-backup.service` y `backend/infra/nuvex-backup.timer` a `/etc/systemd/system`. Ejecuta `systemctl daemon-reload`, prueba con `systemctl start nuvex-backup.service` y activa `systemctl enable --now nuvex-backup.timer`. El temporizador corre a las 03:00 según la hora del servidor.

Prueba restaurar con `restic restore latest --target /srv/nuvex-restore` en un destino separado. Usa la misma versión de Nuvex, coloca los datos restaurados de SeaweedFS, Redis y Caddy en sus rutas y carga `nuvex.dump` mediante `pg_restore` en PostgreSQL vacío. Restaura las credenciales desde su copia segura antes del arranque. Comprueba login, descargas y archivos de distintos tamaños antes de sustituir una instalación.

Revisa semanalmente el espacio, los trabajos fallidos y la fecha de `backup-state/last-success`. Aplica `restic check` de forma periódica. Las alertas de Resend se habilitan con `RESEND_API_KEY`, `NUVEX_ALERT_FROM` de un dominio verificado y `NUVEX_ALERT_TO`. El envío está limitado a un aviso por incidente y día.
