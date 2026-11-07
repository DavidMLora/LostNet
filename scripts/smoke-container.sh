#!/usr/bin/env bash
set -euo pipefail
image="${1:-lostnet:ci}"
mkdir -p .ci-local
proof_dir="$(mktemp -d .ci-local/container-smoke.XXXXXX)"
container=''
cleanup() {
  result=$?
  trap - EXIT
  # Recover the ID even if docker run was interrupted after creating the container.
  if [[ -z "$container" && -s "$proof_dir/container.cid" ]]; then
    container="$(<"$proof_dir/container.cid")"
  fi
  if [[ -n "$container" ]]; then
    if (( result != 0 )); then
      echo '::group::Container smoke failure diagnostics'
      docker inspect --format '{{json .State}}' "$container" || true
      docker port "$container" || true
      docker logs --tail 80 "$container" || true
      for headers in "$proof_dir"/*.headers; do
        if [[ -f "$headers" ]]; then cat "$headers"; fi
      done
      echo '::endgroup::'
    fi
    if ! docker rm --force "$container" >/dev/null; then
      echo '::error::Could not remove the temporary smoke container.' >&2
      if (( result == 0 )); then result=1; fi
    fi
  fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
# Bind loopback only; Docker chooses a free host port for the container's port 80.
container="$(docker run --detach --cidfile "$proof_dir/container.cid" --publish 127.0.0.1::80 "$image")"
mapping="$(docker port "$container" 80/tcp)"
printf 'Smoke container: %s\nPublished mapping: %s\n' "$container" "$mapping"
if [[ ! "$mapping" =~ ^127\.0\.0\.1:([0-9]{1,5})$ ]]; then
  echo '::error::Expected exactly one IPv4 loopback mapping for 80/tcp.' >&2
  exit 1
fi
port="${BASH_REMATCH[1]}"
port=$((10#$port))
if (( port < 1 || port > 65535 )); then
  echo '::error::Invalid published host port.' >&2
  exit 1
fi
base="http://127.0.0.1:$port"
printf 'Smoke URL: %s\n' "$base"
require_running() {
  if [[ "$(docker inspect --format '{{.State.Running}}' "$container")" != true ]]; then
    echo '::error::Container stopped before the smoke checks completed.' >&2
    exit 1
  fi
}
require_running
docker inspect --format '{{json .State}}' "$container"
docker exec "$container" nginx -t
# A directory redirect can refer to Nginx's internal :80. Keep following it, but
# connect that exact loopback destination through this container's published port.
# Other hosts/ports and HTTP failures are not remapped or treated as success.
curl_options=(--silent --show-error --connect-timeout 2 --max-time 5
  --noproxy 127.0.0.1 --proto '=http' --proto-redir '=http' --max-redirs 3
  --connect-to "127.0.0.1:80:127.0.0.1:$port")
ready=false
for attempt in {1..20}; do
  require_running
  if curl "${curl_options[@]}" --fail --dump-header "$proof_dir/login.headers" "$base/" --output "$proof_dir/login.html"; then
    ready=true
    break
  fi
  printf 'Waiting for Nginx (%s/20)...\n' "$attempt"
  sleep 1
done
if [[ "$ready" != true ]]; then
  echo '::error::Nginx did not become available.' >&2
  exit 1
fi
grep -q 'id="google-sign-in"' "$proof_dir/login.html"
# Retry transient failures on every subsequent request, not just the first one.
curl_options+=(--retry 3 --retry-connrefused --retry-delay 1 --retry-max-time 15)
for route in /dashboard /dashboard/; do
  require_running
  curl "${curl_options[@]}" --fail --location --dump-header "$proof_dir/dashboard.headers" "$base$route" --output "$proof_dir/dashboard.html" --write-out "Checked $route: HTTP %{http_code}, socket %{remote_ip}:%{remote_port}\n"
  grep -q 'id="map-module"' "$proof_dir/dashboard.html"
done
curl "${curl_options[@]}" --fail "$base/favicon.jpg" --output /dev/null
status="$(curl "${curl_options[@]}" --output /dev/null --write-out '%{http_code}' "$base/nonexistent-route")"
if [[ "$status" != 404 ]]; then
  printf '::error::Expected HTTP 404 for unknown route, got %s.\n' "$status" >&2
  exit 1
fi
require_running
echo 'Container smoke checks passed: login, dashboard with/without slash, photo asset, 404 and nginx config.'
