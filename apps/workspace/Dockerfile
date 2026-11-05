FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN test "$(node --version)" = "v22.23.4" && test "$(npm --version)" = "10.9.4" && npm ci

FROM deps AS build
COPY . .
ARG SOURCE_SHA
ENV NEXT_PUBLIC_WORKSPACE_BASE_PATH=""
ENV WOODRIGHT_WORKSPACE_SOURCE_SHA=$SOURCE_SHA
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim
ARG SOURCE_SHA
ARG BUILD_RUN_ID
ARG BUILD_RUN_ATTEMPT
LABEL org.opencontainers.image.revision=$SOURCE_SHA com.woodright.component=workspace com.woodright.workflow.run_id=$BUILD_RUN_ID com.woodright.workflow.run_attempt=$BUILD_RUN_ATTEMPT
WORKDIR /app
RUN groupadd --gid 10001 workspace && useradd --uid 10001 --gid 10001 --no-create-home workspace
COPY --from=build --chown=10001:10001 /app/.next-build/standalone ./
COPY --from=build --chown=10001:10001 /app/.next-build/static ./.next-build/static
COPY --from=build --chown=10001:10001 /app/public ./public
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=4320
USER 10001:10001
EXPOSE 4320
HEALTHCHECK --interval=20s --timeout=15s --start-period=30s --retries=3 CMD node -e "fetch('http://127.0.0.1:4320/api/live/status').then(r=>r.json()).then(d=>{if(!d.connected)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.js"]
