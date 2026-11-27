#!/usr/bin/env sh
# Run with mariadb-dump available; backups contain sensitive personal data.
set -eu
: "${DB_HOST:=localhost}" "${DB_PORT:=3306}" "${DB_NAME:?set DB_NAME}" "${DB_USER:?set DB_USER}" "${DB_PASSWORD:?set DB_PASSWORD}"
: "${BACKUP_DIR:=./backups}" "${UPLOAD_DIR:=./uploads}" "${KEEP_DAYS:=14}"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d-%H%M%S)
export MYSQL_PWD="$DB_PASSWORD"
mariadb-dump --single-transaction --routines --triggers -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
if [ -d "$UPLOAD_DIR" ]; then tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$UPLOAD_DIR" .; fi
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup written: $BACKUP_DIR/db-$STAMP.sql.gz"
