# Woodright Next.js storefront — production image
# Build-args required for NEXT_PUBLIC_* bake-in.
# Note: apps/*/.yarn is gitignored; rely on corepack + yarn.lock.

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY . .
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
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    NEXT_DIST_DIR=.next-build
RUN useradd --system --uid 10001 --create-home nextjs
COPY --from=build --chown=nextjs:nextjs /app/package.json /app/yarn.lock /app/.yarnrc.yml ./
COPY --from=build --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nextjs /app/.next-build ./.next-build
COPY --from=build --chown=nextjs:nextjs /app/public ./public
COPY --from=build --chown=nextjs:nextjs /app/next.config.js ./next.config.js
USER nextjs
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3002)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["yarn", "start"]
