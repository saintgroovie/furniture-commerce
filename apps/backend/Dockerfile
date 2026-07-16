# Woodright Medusa backend — production image
# Build: docker build -t woodright-backend:<sha> -f apps/backend/Dockerfile apps/backend
# Migrations (one-shot, no seed):
#   docker run --rm ... woodright-backend:<sha> ./scripts/migrate-only.sh

FROM node:20-bookworm-slim AS deps
WORKDIR /server
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
# postinstall patches live under scripts/ and must exist before yarn install
COPY scripts ./scripts
RUN yarn install --immutable

FROM node:20-bookworm-slim AS build
WORKDIR /server
RUN corepack enable
COPY --from=deps /server/node_modules ./node_modules
COPY --from=deps /server/package.json /server/yarn.lock /server/.yarnrc.yml ./
COPY . .
# Build-time placeholders for Medusa config load only (discarded from runtime contract).
# No real credentials: unreachable local DSN without embedded password material.
ENV NODE_ENV=development \
    DATABASE_URL=postgres://127.0.0.1:5432/woodright_image_build \
    JWT_SECRET=woodright-image-build-jwt-placeholder-00000000 \
    COOKIE_SECRET=woodright-image-build-cookie-placeholder-000000
RUN yarn medusa build

FROM node:20-bookworm-slim AS runner
WORKDIR /server
ENV NODE_ENV=production \
    PORT=9000
RUN corepack enable \
 && useradd --system --uid 10001 --create-home medusa \
 && mkdir -p /server/static \
 && chown -R medusa:medusa /server/static
COPY --from=build --chown=medusa:medusa /server/package.json /server/yarn.lock /server/.yarnrc.yml ./
COPY --from=build --chown=medusa:medusa /server/node_modules ./node_modules
COPY --from=build --chown=medusa:medusa /server/dist ./dist
COPY --from=build --chown=medusa:medusa /server/medusa-config.ts ./medusa-config.ts
COPY --from=build --chown=medusa:medusa /server/src ./src
COPY --from=build --chown=medusa:medusa /server/scripts ./scripts
USER medusa
EXPOSE 9000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||9000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["yarn", "medusa", "start"]
