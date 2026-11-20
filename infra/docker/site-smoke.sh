#!/usr/bin/env bash
# Smoke of the landing page image (site/Dockerfile, docs/context/deploy.md): waits for the HEALTHCHECK of a
# running container and checks the routes, the 404, the CSP meta, the asset cache and the security headers.
# Usage: infra/docker/site-smoke.sh <container> <base-url>   e.g. site-smoke.sh lorkarium-site http://localhost:8080
set -euo pipefail

container="$1"
base="$2"

fail() {
  echo "site smoke failed: $1" >&2
  docker logs "$container" 2>&1 | tail -40 >&2
  exit 1
}

status_of() { curl -s -o /dev/null -w '%{http_code}' "$base$1"; }

expect_status() {
  local got
  got="$(status_of "$1")"
  [ "$got" = "$2" ] || fail "GET $base$1 answered $got, expected $2"
}

for _ in $(seq 1 30); do
  health="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo gone)"
  [ "$health" = healthy ] && break
  [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null)" = true ] || fail "container stopped ($health)"
  sleep 2
done
[ "$health" = healthy ] || fail "container never became healthy ($health)"

home="$(curl -sf "$base/")" || fail "GET $base/ is not 2xx"
grep -q 'LORKARIUM' <<<"$home" || fail "GET $base/ has no 'LORKARIUM' wordmark"
csp="$(grep -io '<meta[^>]*http-equiv="content-security-policy"[^>]*>' <<<"$home" | head -1 || true)"
[ -n "$csp" ] || fail "GET $base/ has no <meta http-equiv=\"content-security-policy\">"
grep -q "connect-src 'self' https://api.github.com" <<<"$csp" ||
  fail "the CSP meta of $base/ must have connect-src 'self' https://api.github.com, got: $csp"

expect_status /obrigado/ 200
expect_status /termos/ 200
expect_status /privacidade/ 200

expect_status /404.html 200
expect_status /nao-existe/ 404
[ "$(curl -s "$base/nao-existe/")" = "$(curl -s "$base/404.html")" ] ||
  fail "GET $base/nao-existe/ must answer the body of /404.html"

# SEO: crawlable icon, robots with the absolute sitemap, sitemap index, trailing-slash redirect.
robots="$(curl -sf "$base/robots.txt")" || fail "GET $base/robots.txt is not 2xx"
grep -q '^Sitemap: https\?://[^ ]*/sitemap-index.xml$' <<<"$robots" ||
  fail "GET $base/robots.txt must end in an absolute Sitemap: line, got: $robots"
expect_status /sitemap-index.xml 200
icon_type="$(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$base/favicon-48.png")"
[ "$icon_type" = "200 image/png" ] || fail "GET $base/favicon-48.png answered '$icon_type', expected '200 image/png'"
redirect="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' "$base/termos")"
# Caddy's file_server answers 308; Google treats it as a 301 (permanent, passes the signals).
[[ "$redirect" =~ ^30[18]\ .*/termos/$ ]] ||
  fail "GET $base/termos answered '$redirect', expected a permanent redirect to /termos/"

asset="$(grep -o '/_astro/[^"'"'"' )>]*' <<<"$home" | head -1 || true)"
[ -n "$asset" ] || fail "GET $base/ references no /_astro/ file"
asset_headers="$(curl -s -D - -o /dev/null "$base$asset")"
grep -qi '^cache-control:.*immutable' <<<"$asset_headers" ||
  fail "GET $base$asset must send Cache-Control with immutable, got: $(grep -i '^cache-control' <<<"$asset_headers" || echo none)"

page_headers="$(curl -s -D - -o /dev/null "$base/")"
grep -qi '^x-content-type-options: nosniff' <<<"$page_headers" || fail "GET $base/ must send X-Content-Type-Options: nosniff"
grep -qi '^referrer-policy: strict-origin-when-cross-origin' <<<"$page_headers" ||
  fail "GET $base/ must send Referrer-Policy: strict-origin-when-cross-origin"
! grep -qi '^server:' <<<"$page_headers" || fail "GET $base/ must not send a Server header"
! grep -qi '^cache-control:.*immutable' <<<"$page_headers" || fail "GET $base/ (HTML) must not be cached as immutable"

echo "site smoke passed: $base"
