#!/bin/sh

set -eu

STATE_ROOT="${ORCA_STATE_ROOT:-/work/orca-state}"

mkdir -p \
  "${STATE_ROOT}" \
  "${STATE_ROOT}/config" \
  "${STATE_ROOT}/cache" \
  "${STATE_ROOT}/runtime"

chmod 700 "${STATE_ROOT}/runtime"

export HOME="${STATE_ROOT}"
export XDG_CONFIG_HOME="${STATE_ROOT}/config"
export XDG_CACHE_HOME="${STATE_ROOT}/cache"
export XDG_RUNTIME_DIR="${STATE_ROOT}/runtime"

export LIBGL_ALWAYS_SOFTWARE=1

exec xvfb-run \
  -a \
  --server-args="-screen 0 1024x768x24 -nolisten tcp" \
  /opt/orca/AppRun \
  "$@"
