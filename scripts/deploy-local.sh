#!/bin/bash
# Local deploy: copy fresh build artifacts into the running container.
# Avoids docker-compose build (which fails on this host due to credential store issues).
# Run from project root after: npm run build

set -e

echo "Building..."
npm run build

echo "Deploying to container..."

# Native modules must come from the image, never from this host.
#
# The container is Alpine (musl libc); this host is Ubuntu (glibc). The
# standalone bundle carries node_modules with it, so copying it wholesale
# overwrites the container's native builds with ones it cannot load. That is
# exactly what took the instance down on 2026-09-11: a sharp bump (0.34.5 ->
# 0.35.4) produced @img/sharp-linux-x64 on this host and no musl variant, so
# sharp failed to load in the container. Nothing said "sharp" — the app died
# with
#   An error occurred while loading instrumentation hook:
#   Cannot read properties of undefined (reading 'output')
# because instrumentation.ts starts the photo cron, which imports sharp, and
# every route then 500'd.
#
# The image's node_modules already hold musl builds of these, so the fix is to
# leave them out of the copy and let the container keep what it has.
NATIVE_MODULES="sharp @img"

# Stage the bundle and strip those out. cp -al hardlinks rather than copies, so
# this costs no real time or disk even though the bundle is ~260MB, and the rm
# below only drops the staged link — the real build is untouched.
STAGE=.next/deploy-staging
rm -rf "$STAGE"
cp -al .next/standalone "$STAGE"
trap 'rm -rf "$STAGE"' EXIT

for m in $NATIVE_MODULES; do
  rm -rf "${STAGE:?}/node_modules/$m"
done

# Guard against a *new* native dependency quietly reintroducing the same bug.
# Anything shipping .node binaries that we are not already excluding gets
# named here rather than discovered later as an unrelated-looking 500.
unexpected=$(find "$STAGE/node_modules" -name '*.node' -type f 2>/dev/null \
  | sed "s|^$STAGE/node_modules/||" \
  | awk -F/ '{print $1}' \
  | sort -u)
if [ -n "$unexpected" ]; then
  echo "WARNING: native (.node) binaries built for this host are about to be"
  echo "         copied into the Alpine container, which may not load them:"
  echo "$unexpected" | sed 's/^/           /'
  echo "         Add them to NATIVE_MODULES in $0 if the container provides its own."
fi

# Leaving the container's copies in place means they can lag package.json after
# a bump, so say when they have rather than letting it drift silently. Fixing a
# drift needs the image rebuilt (or musl builds installed into it); it is not
# something this script can do.
for m in $NATIVE_MODULES; do
  [ "$m" = "@img" ] && continue
  want=$(node -p "require('./package.json').dependencies['$m'] || ''" 2>/dev/null | tr -d '^~')
  have=$(docker exec prism-app node -p "require('/app/node_modules/$m/package.json').version" 2>/dev/null)
  if [ -n "$want" ] && [ -n "$have" ] && [ "$want" != "$have" ]; then
    echo "NOTE: container keeps $m $have; package.json asks for $want."
    echo "      Native modules come from the image by design (see above);"
    echo "      rebuild the image to close the gap."
  fi
done

# Copy server-side standalone files (native modules excluded, see above)
docker cp "$STAGE/." prism-app:/app/

# Remove old static dir (as root to avoid permission issues from prior cp operations)
# then copy contents (trailing /.) so they land at /app/.next/static/* not nested deeper
docker exec --user root prism-app sh -c "rm -rf /app/.next/static && mkdir -p /app/.next/static"
docker cp .next/static/. prism-app:/app/.next/static/

# Public assets, incl. the PWA service worker. Next.js standalone output does
# NOT bundle public/, so without this the container keeps the image's stale
# sw.js — its precache manifest points at old chunk hashes, so browsers keep
# serving an outdated app (and can't cleanly update) after every deploy.
docker cp public/. prism-app:/app/public/
docker exec --user root prism-app chown -R nextjs:nodejs /app/public

# The standalone bundle ships empty data/ dirs (recipe-images, photos). The
# docker cp above lays them over the bind-mounted /app/data, resetting it to
# the host uid so the container user (nextjs) can no longer write uploads
# (recipe images, imported photos). Restore app ownership after every copy.
docker exec --user root prism-app chown -R nextjs:nodejs /app/data

# docker cp writes as root, and the standalone bundle carries .env and .next
# with it. The app runs as nextjs, so without this it cannot read its own
# environment (EACCES on /app/.env) or write its render cache (EACCES on
# /app/.next/cache) — which surfaces later as pages failing to load rather than
# as anything that looks like a deploy problem.
docker exec --user root prism-app sh -c "
  chown -R nextjs:nodejs /app/.next /app/.env 2>/dev/null || true
  mkdir -p /app/.next/cache && chown -R nextjs:nodejs /app/.next/cache" 

echo "Restarting app..."
docker compose restart app

# Wait for the app to actually come up, rather than guessing at 5 seconds.
# The old fixed sleep was shorter than a cold start, so it printed the same
# warning after a perfectly good deploy as after a broken one — which is how a
# genuinely broken deploy got waved through on 2026-09-11.
echo "Done. Waiting for health check..."
for _ in $(seq 1 30); do
  if curl -sf -m 5 http://localhost:3000/api/health/ready >/dev/null 2>&1; then
    echo "App is healthy: $(curl -s -m 5 http://localhost:3000/api/health/ready)"
    exit 0
  fi
  sleep 3
done

echo "WARNING: app did not become healthy within 90s."
echo "--- last 20 log lines ---"
docker logs prism-app --tail 20 2>&1
# A native module that will not load is the likeliest cause and the hardest to
# read from the logs, so name it directly.
echo "--- native module check ---"
docker exec prism-app node -e "require('sharp'); console.log('sharp loads OK')" 2>&1 | tail -3
exit 1
