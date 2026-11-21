#!/usr/bin/env bash
set -euo pipefail

: "${NUVEX_DATA:?Configura el directorio de datos}"
: "${NUVEX_BACKUP_STATE:?Configura el directorio de estado}"
: "${RESTIC_REPOSITORY:?Configura el repositorio Restic}"
: "${RESTIC_PASSWORD_FILE:?Configura el archivo de contraseña de Restic}"

backup_device="$(findmnt -n -o SOURCE --target "$RESTIC_REPOSITORY")"
data_device="$(findmnt -n -o SOURCE --target "$NUVEX_DATA")"
if [[ -z "$backup_device" || "$backup_device" == "$data_device" ]]; then
  echo 'Usa un repositorio Restic montado por separado del directorio de datos.' >&2
  exit 1
fi

mkdir -p "$NUVEX_BACKUP_STATE"
exec 9>"$NUVEX_BACKUP_STATE/backup.lock"
flock -n 9
work="$(mktemp -d "$NUVEX_BACKUP_STATE/run.XXXXXXXX")"
paused=0
cleanup() {
  local exit_status=$?
  trap - EXIT
  if [[ "$paused" == 1 ]]; then
    docker compose start storage redis
    docker compose start api worker caddy
  fi
  rm -f -- "$work/nuvex.dump"
  rmdir -- "$work"
  exit "$exit_status"
}
trap cleanup EXIT
paused=1
docker compose stop caddy api worker
docker compose exec -T db pg_dump -U nuvex -Fc nuvex > "$work/nuvex.dump"
docker compose stop storage redis
restic backup --tag nuvex "$work/nuvex.dump" "$NUVEX_DATA/seaweedfs" "$NUVEX_DATA/redis" "$NUVEX_DATA/caddy"
touch "$NUVEX_BACKUP_STATE/last-success"
