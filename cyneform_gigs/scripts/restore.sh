#!/usr/bin/env sh
# Usage: sh scripts/restore.sh backups/db-YYYYMMDD-HHMMSS.sql.gz [backups/uploads-YYYYMMDD-HHMMSS.tar.gz]
set -eu
: "${DB_HOST:=localhost}" "${DB_PORT:=3306}" "${DB_NAME:?set DB_NAME}" "${DB_USER:?set DB_USER}" "${DB_PASSWORD:?set DB_PASSWORD}" "${UPLOAD_DIR:=./uploads}"
[ -f "${1:?give the .sql.gz file}" ]
echo "This replaces the database $DB_NAME. Type RESTORE to continue:"
read -r ok
[ "$ok" = "RESTORE" ]
export MYSQL_PWD="$DB_PASSWORD"
gunzip -c "$1" | mariadb -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME"
if [ -n "${2:-}" ]; then mkdir -p "$UPLOAD_DIR" && tar -xzf "$2" -C "$UPLOAD_DIR"; fi
echo "Restore complete."
