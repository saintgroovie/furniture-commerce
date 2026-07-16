# Woodright Next.js storefront — production image
# MUST be built with repository root as context:
#   docker build -f apps/storefront/Dockerfile .
# Storefront imports shared gallery helpers from apps/backend/src/lib.

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
ARG NEXT_PUBLIC_MEDUSA_BACKEND_URL
ARG MEDUSA_BACKEND_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=
ARG NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=0
ENV NEXT_DIST_DIR=.next-build \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    MEDUSA_BACKEND_URL=$MEDUSA_BACKEND_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=$NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES \
    NODE_ENV=production
RUN test -n "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" \
 && test -n "$MEDUSA_BACKEND_URL" \
 && test -n "$NEXT_PUBLIC_SITE_URL" \
 && yarn build

FROM node:20-bookworm-slim AS runner
WORKDIR /workspace/apps/storefront
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    NEXT_DIST_DIR=.next-build
RUN useradd --system --uid 10001 --create-home nextjs
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/package.json /workspace/apps/storefront/yarn.lock /workspace/apps/storefront/.yarnrc.yml ./
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/node_modules ./node_modules
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/.next-build ./.next-build
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/public ./public
COPY --from=build --chown=nextjs:nextjs /workspace/apps/storefront/next.config.js ./next.config.js
# Keep runtime resolution path for any residual relative imports
COPY --from=build --chown=nextjs:nextjs /workspace/apps/backend/src/lib /workspace/apps/backend/src/lib
USER nextjs
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
# Avoid `yarn` at runtime (corepack may try to write .yarn as UID 10001).
CMD ["./node_modules/.bin/next", "start"]
