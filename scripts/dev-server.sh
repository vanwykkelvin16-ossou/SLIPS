#!/usr/bin/env bash
# Starts (or restarts) the production server for local end-to-end testing.
#
#   scripts/dev-server.sh restart   # stop anything on the port, then start
#   scripts/dev-server.sh stop
#   scripts/dev-server.sh status
set -uo pipefail

PORT="${PORT:-3000}"
LOG="${SERVER_LOG:-/tmp/slipsy-server.log}"

serving() {
  curl -fsS -o /dev/null --max-time 2 "http://localhost:${PORT}/login" 2>/dev/null
}

find_pids() {
  # lsof does not always see a listener started from a detached session in this
  # container, so match the Next server process itself as well.
  {
    lsof -ti:"${PORT}" 2>/dev/null || true
    pgrep -f "next-server" 2>/dev/null || true
    pgrep -f "next start" 2>/dev/null || true
  } | sort -u
}

stop_server() {
  local pids
  pids="$(find_pids)"
  if [ -n "${pids}" ]; then
    echo "stopping: $(echo "${pids}" | tr '\n' ' ')"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
  fi

  # The port is only truly free once nothing answers on it.
  for _ in $(seq 1 30); do
    serving || return 0
    sleep 0.5
  done

  pids="$(find_pids)"
  if [ -n "${pids}" ]; then
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
  fi
  sleep 1
  serving && { echo "could not free port ${PORT}" >&2; return 1; }
  return 0
}

start_server() {
  if serving; then
    echo "port ${PORT} is already serving" >&2
    return 1
  fi

  : > "${LOG}"
  setsid npm start > "${LOG}" 2>&1 < /dev/null &

  for _ in $(seq 1 60); do
    if grep -q "EADDRINUSE" "${LOG}" 2>/dev/null; then
      echo "another process holds port ${PORT}" >&2
      return 1
    fi
    if serving; then
      echo "server ready on ${PORT} (log: ${LOG})"
      return 0
    fi
    sleep 1
  done

  echo "server did not become ready; last log lines:" >&2
  tail -20 "${LOG}" >&2
  return 1
}

case "${1:-restart}" in
  stop) stop_server ;;
  start) start_server ;;
  restart)
    stop_server || exit 1
    start_server
    ;;
  status)
    serving && echo up || echo down
    ;;
  *)
    echo "usage: $0 {start|stop|restart|status}" >&2
    exit 2
    ;;
esac
