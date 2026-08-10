#!/usr/bin/env bash
# scripts/setup-rclone.sh
# Generates /app/rclone.conf from Clever Cloud Cellar env vars

set -euo pipefail

CONF=/app/rclone.conf
CACHE=/app/rclone-cache

mkdir -p "$CACHE"

# Strip protocol prefix if present
CELLAR_HOST="${CELLAR_ADDON_HOST#https://}"
CELLAR_HOST="${CELLAR_HOST#http://}"

cat > "$CONF" <<EOF
[cellar]
type = s3
provider = Other
env_auth = false
access_key_id = ${CELLAR_ADDON_KEY_ID}
secret_access_key = ${CELLAR_ADDON_KEY_SECRET}
endpoint = https://${CELLAR_HOST}
region = ${CELLAR_REGION:-default}
acl = private
force_path_style = ${S3_FORCE_PATH_STYLE:-true}
no_check_bucket = false
EOF

chmod 600 "$CONF"
echo "[rclone] Config written to $CONF"
rclone --config "$CONF" version | head -1

# Ensure Cellar bucket exists
BUCKET="${CELLAR_BUCKET:-clever-coder}"
echo "[rclone] Ensuring bucket '$BUCKET' exists in Cellar..."
rclone --config "$CONF" mkdir "cellar:$BUCKET" || echo "[rclone] Bucket creation notice: $?"
