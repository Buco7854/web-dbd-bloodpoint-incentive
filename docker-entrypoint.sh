#!/bin/sh
set -e

# A named volume mounted at the state dir is typically root-owned, which the
# non-root app user cannot write. Fix it here (we still run as root at this
# point), then drop privileges to the app user for the process itself.
DIR="${STATE_DIR:-/app/data}"
USER_NAME="${APP_USER:-node}"
mkdir -p "$DIR" 2>/dev/null || true
chown -R "$USER_NAME":"$USER_NAME" "$DIR" 2>/dev/null || true

exec gosu "$USER_NAME" "$@"
