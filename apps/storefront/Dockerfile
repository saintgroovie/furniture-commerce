# Woodright Next.js storefront — production image (standalone slim)
# MUST be built with repository root as context:
#   docker build -f apps/storefront/Dockerfile .
#
# Build still needs apps/backend/src/lib (buyer-gallery relative imports).
# Runtime uses Next standalone output only — no full yarn node_modules tree.

FROM node:20-bookworm-slim AS deps
WORKDIR /workspace/apps/storefront
RUN corepack enable
COPY apps/storefront/package.json apps/storefront/yarn.lock apps/storefront/.yarnrc.yml ./
RUN yarn install --immutable

FROM node:20-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY --from=deps /workspace/apps/storefront/node_modules ./apps/storefront/node_modules
COPY --from=deps /workspace/apps/storefront/package.json /workspace/apps/storefront/yarn.lock /workspace/apps/storefront/.yarnrc.yml ./apps/storefront/
COPY apps/storefront ./apps/storefront
# Shared buyer-gallery helpers imported via ../../../backend/src/lib/*
COPY apps/backend/src/lib ./apps/backend/src/lib
WORKDIR /workspace/apps/storefront
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL=
ARG MEDUSA_BACKEND_URL
ARG MEDUSA_BACKEND_INTERNAL_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
# Staging media volume has card WebP derivatives; bake-on so catalog heroes
# prefer /derivatives/card/*.webp with onError fallback to originals.
ARG NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=1
ENV NEXT_DIST_DIR=.next-build \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    MEDUSA_BACKEND_URL=$MEDUSA_BACKEND_URL \
    MEDUSA_BACKEND_INTERNAL_URL=$MEDUSA_BACKEND_INTERNAL_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=$NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES \
    NODE_ENV=production
# NEXT_PUBLIC_MEDUSA_BACKEND_URL is optional: browser uses same-origin /store + /product-static.
# Do not bake a public :9000 host into the client bundle.
RUN test -n "$MEDUSA_BACKEND_URL" \
 && test -n "$NEXT_PUBLIC_SITE_URL" \
 && yarn build \
 && test -f .next-build/standalone/apps/storefront/server.js \
 && (test -d .next-build/standalone/node_modules \
     || test -d .next-build/standalone/apps/storefront/node_modules) \
 && ! find .next-build/standalone -type l | grep -q . \
 && ls -la .next-build/standalone/apps/storefront \
 && { du -sh .next-build/standalone .next-build/standalone/apps/storefront/node_modules .next-build/standalone/node_modules 2>/dev/null || true; }

FROM node:20-bookworm-slim AS runner
WORKDIR /workspace
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    NEXT_DIST_DIR=.next-build
RUN useradd --system --uid 10001 --create-home nextjs
# Standalone tree already includes traced node_modules + server.js under apps/storefront.
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/.next-build/standalone ./
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/.next-build/static ./apps/storefront/.next-build/static
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/public ./apps/storefront/public
USER nextjs
WORKDIR /workspace/apps/storefront
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
