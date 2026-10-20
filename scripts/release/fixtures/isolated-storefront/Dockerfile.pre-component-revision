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
# Public-launch contract (apps/storefront/src/lib/launch-contract.ts /
# payment-mode.ts). Unset by default - CI/local builds are unaffected;
# only enforced below when explicitly passed.
ARG WOODRIGHT_LAUNCH_MODE=
ARG WOODRIGHT_PAYMENT_MODE=
# Image build profile (ops/config/image-build-profiles/*.conf via
# scripts/release/resolve-image-build-profile.cjs). Controls which
# launch-contract gate branch below applies. Empty = legacy/backward-compat
# behavior (only gated when WOODRIGHT_LAUNCH_MODE is explicitly passed).
ARG WOODRIGHT_IMAGE_BUILD_PROFILE=
# Runtime identity evidence baked as image ENV defaults only (labels/audit -
# NOT what the running container actually uses at request time; see
# apps/storefront/src/lib/runtime-identity-headers.ts, which reads the
# *runtime* WOODRIGHT_RUNTIME_ROLE / WOODRIGHT_EXPOSURE /
# WOODRIGHT_DATABASE_IDENTITY env set by docker-compose at container start -
# those override these Dockerfile-baked defaults).
ARG WOODRIGHT_RUNTIME_ROLE=
ARG WOODRIGHT_RUNTIME_EXPOSURE=
ARG WOODRIGHT_DB_ALIAS=
ARG WOODRIGHT_ADMIN_EXPOSURE=
ENV NEXT_DIST_DIR=.next-build \
    NEXT_PUBLIC_MEDUSA_BACKEND_URL=$NEXT_PUBLIC_MEDUSA_BACKEND_URL \
    MEDUSA_BACKEND_URL=$MEDUSA_BACKEND_URL \
    MEDUSA_BACKEND_INTERNAL_URL=$MEDUSA_BACKEND_INTERNAL_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY=$NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY \
    NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES=$NEXT_PUBLIC_CATALOG_CARD_DERIVATIVES \
    WOODRIGHT_LAUNCH_MODE=$WOODRIGHT_LAUNCH_MODE \
    WOODRIGHT_PAYMENT_MODE=$WOODRIGHT_PAYMENT_MODE \
    WOODRIGHT_IMAGE_BUILD_PROFILE=$WOODRIGHT_IMAGE_BUILD_PROFILE \
    WOODRIGHT_RUNTIME_ROLE=$WOODRIGHT_RUNTIME_ROLE \
    WOODRIGHT_RUNTIME_EXPOSURE=$WOODRIGHT_RUNTIME_EXPOSURE \
    WOODRIGHT_DB_ALIAS=$WOODRIGHT_DB_ALIAS \
    WOODRIGHT_ADMIN_EXPOSURE=$WOODRIGHT_ADMIN_EXPOSURE \
    NODE_ENV=production
# NEXT_PUBLIC_MEDUSA_BACKEND_URL is optional: browser uses same-origin /store + /product-static.
# Do not bake a public :9000 host into the client bundle.
#
# Launch-contract validation is PROFILE-AWARE (WOODRIGHT_IMAGE_BUILD_PROFILE).
#
# RCA (fixed 2026-07-31): WOODRIGHT_LAUNCH_MODE alone used to force
# NEXT_PUBLIC_SITE_URL=https://woodright.ru unconditionally whenever it was
# passed - which would incorrectly reject a legitimate public_demo bake
# targeting woodright-demo.ru. Worse, the workflow that historically produced
# "production-candidate" images (.github/workflows/build-staging-images.yml)
# never set WOODRIGHT_LAUNCH_MODE at all, so this whole gate was silently
# skipped and demo-host images were shipped as production-candidate images.
# See ops/config/image-build-profiles/*.conf +
# scripts/release/resolve-image-build-profile.cjs (source of truth for what
# gets baked per profile) and scripts/release/scan-storefront-contamination.cjs
# (post-build gate on the actual compiled bytes, not just these build-args).
#
# - profile=production_candidate: require woodright.ru / api.woodright.ru,
#   reject demo/loopback, require private_noindex + manual_invoice.
# - profile=public_demo: require woodright-demo.ru / api.woodright-demo.ru,
#   reject the production apex + loopback, require private_noindex +
#   manual_invoice.
# - profile empty: legacy/backward-compat - only gated when
#   WOODRIGHT_LAUNCH_MODE is explicitly passed (unchanged prior behavior for
#   local/CI builds that don't set a profile).
# - profile anything else: fail closed.
RUN test -n "$MEDUSA_BACKEND_URL" \
 && test -n "$NEXT_PUBLIC_SITE_URL" \
 && case "$WOODRIGHT_IMAGE_BUILD_PROFILE" in \
      "") \
        if [ -n "$WOODRIGHT_LAUNCH_MODE" ]; then \
          case "$WOODRIGHT_LAUNCH_MODE" in \
            private_noindex|public_indexable) ;; \
            *) echo "WOODRIGHT_LAUNCH_MODE must be private_noindex|public_indexable, got: $WOODRIGHT_LAUNCH_MODE" >&2; exit 1 ;; \
          esac; \
          case "$WOODRIGHT_PAYMENT_MODE" in \
            manual_invoice) ;; \
            *) echo "WOODRIGHT_LAUNCH_MODE set requires WOODRIGHT_PAYMENT_MODE=manual_invoice, got: ${WOODRIGHT_PAYMENT_MODE:-<empty>}" >&2; exit 1 ;; \
          esac; \
          echo "$NEXT_PUBLIC_SITE_URL" | grep -Eq '^https://(www\.)?woodright\.ru/?$' \
            || { echo "WOODRIGHT_LAUNCH_MODE requires NEXT_PUBLIC_SITE_URL=https://woodright.ru (or www), got: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
          echo "$NEXT_PUBLIC_SITE_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
            && { echo "WOODRIGHT_LAUNCH_MODE rejects demo/loopback NEXT_PUBLIC_SITE_URL: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
          echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eq '^https://api\.woodright\.ru/?$' \
            || { echo "WOODRIGHT_LAUNCH_MODE requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright.ru, got: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-<empty>}" >&2; exit 1; }; \
          echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
            && { echo "WOODRIGHT_LAUNCH_MODE rejects demo/loopback API URL: $NEXT_PUBLIC_MEDUSA_BACKEND_URL" >&2; exit 1; }; \
        fi \
        ;; \
      production_candidate) \
        case "$WOODRIGHT_LAUNCH_MODE" in \
          private_noindex) ;; \
          *) echo "profile=production_candidate requires WOODRIGHT_LAUNCH_MODE=private_noindex, got: ${WOODRIGHT_LAUNCH_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        case "$WOODRIGHT_PAYMENT_MODE" in \
          manual_invoice) ;; \
          *) echo "profile=production_candidate requires WOODRIGHT_PAYMENT_MODE=manual_invoice, got: ${WOODRIGHT_PAYMENT_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eq '^https://(www\.)?woodright\.ru/?$' \
          || { echo "profile=production_candidate requires NEXT_PUBLIC_SITE_URL=https://woodright.ru (or www), got: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
          && { echo "profile=production_candidate rejects demo/loopback NEXT_PUBLIC_SITE_URL: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eq '^https://api\.woodright\.ru/?$' \
          || { echo "profile=production_candidate requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright.ru, got: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-<empty>}" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
          && { echo "profile=production_candidate rejects demo/loopback API URL: $NEXT_PUBLIC_MEDUSA_BACKEND_URL" >&2; exit 1; }; \
        [ "$WOODRIGHT_RUNTIME_ROLE" = "production_candidate" ] \
          || { echo "profile=production_candidate requires WOODRIGHT_RUNTIME_ROLE=production_candidate, got: ${WOODRIGHT_RUNTIME_ROLE:-<empty>}" >&2; exit 1; }; \
        [ "$WOODRIGHT_DB_ALIAS" = "non_public_candidate_db" ] \
          || { echo "profile=production_candidate requires WOODRIGHT_DB_ALIAS=non_public_candidate_db, got: ${WOODRIGHT_DB_ALIAS:-<empty>}" >&2; exit 1; }; \
        ;; \
      public_demo) \
        case "$WOODRIGHT_LAUNCH_MODE" in \
          private_noindex) ;; \
          *) echo "profile=public_demo requires WOODRIGHT_LAUNCH_MODE=private_noindex, got: ${WOODRIGHT_LAUNCH_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        case "$WOODRIGHT_PAYMENT_MODE" in \
          manual_invoice) ;; \
          *) echo "profile=public_demo requires WOODRIGHT_PAYMENT_MODE=manual_invoice, got: ${WOODRIGHT_PAYMENT_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eq '^https://(www\.)?woodright-demo\.ru/?$' \
          || { echo "profile=public_demo requires NEXT_PUBLIC_SITE_URL=https://woodright-demo.ru, got: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eiq '^https://(www\.)?woodright\.ru/?$|127\.0\.0\.1|localhost' \
          && { echo "profile=public_demo rejects production apex/loopback NEXT_PUBLIC_SITE_URL: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eq '^https://api\.woodright-demo\.ru/?$' \
          || { echo "profile=public_demo requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright-demo.ru, got: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-<empty>}" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eiq '^https://api\.woodright\.ru/?$|127\.0\.0\.1|localhost' \
          && { echo "profile=public_demo rejects production apex/loopback API URL: $NEXT_PUBLIC_MEDUSA_BACKEND_URL" >&2; exit 1; }; \
        [ "$WOODRIGHT_RUNTIME_ROLE" = "public_demo" ] \
          || { echo "profile=public_demo requires WOODRIGHT_RUNTIME_ROLE=public_demo, got: ${WOODRIGHT_RUNTIME_ROLE:-<empty>}" >&2; exit 1; }; \
        [ "$WOODRIGHT_DB_ALIAS" = "public_demo_db" ] \
          || { echo "profile=public_demo requires WOODRIGHT_DB_ALIAS=public_demo_db, got: ${WOODRIGHT_DB_ALIAS:-<empty>}" >&2; exit 1; }; \
        ;; \
      public_production) \
        case "$WOODRIGHT_LAUNCH_MODE" in \
          public_indexable) ;; \
          *) echo "profile=public_production requires WOODRIGHT_LAUNCH_MODE=public_indexable, got: ${WOODRIGHT_LAUNCH_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        case "$WOODRIGHT_PAYMENT_MODE" in \
          manual_invoice) ;; \
          *) echo "profile=public_production requires WOODRIGHT_PAYMENT_MODE=manual_invoice, got: ${WOODRIGHT_PAYMENT_MODE:-<empty>}" >&2; exit 1 ;; \
        esac; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eq '^https://(www\.)?woodright\.ru/?$' \
          || { echo "profile=public_production requires NEXT_PUBLIC_SITE_URL=https://woodright.ru (or www), got: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_SITE_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
          && { echo "profile=public_production rejects demo/loopback NEXT_PUBLIC_SITE_URL: $NEXT_PUBLIC_SITE_URL" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eq '^https://api\.woodright\.ru/?$' \
          || { echo "profile=public_production requires NEXT_PUBLIC_MEDUSA_BACKEND_URL=https://api.woodright.ru, got: ${NEXT_PUBLIC_MEDUSA_BACKEND_URL:-<empty>}" >&2; exit 1; }; \
        echo "$NEXT_PUBLIC_MEDUSA_BACKEND_URL" | grep -Eiq 'woodright-demo\.ru|127\.0\.0\.1|localhost' \
          && { echo "profile=public_production rejects demo/loopback API URL: $NEXT_PUBLIC_MEDUSA_BACKEND_URL" >&2; exit 1; }; \
        [ "$WOODRIGHT_RUNTIME_ROLE" = "public_production" ] \
          || { echo "profile=public_production requires WOODRIGHT_RUNTIME_ROLE=public_production, got: ${WOODRIGHT_RUNTIME_ROLE:-<empty>}" >&2; exit 1; }; \
        [ "$WOODRIGHT_DB_ALIAS" = "public_production_db" ] \
          || { echo "profile=public_production requires WOODRIGHT_DB_ALIAS=public_production_db, got: ${WOODRIGHT_DB_ALIAS:-<empty>}" >&2; exit 1; }; \
        ;; \
      *) \
        echo "Unknown WOODRIGHT_IMAGE_BUILD_PROFILE: $WOODRIGHT_IMAGE_BUILD_PROFILE (expected empty|public_demo|production_candidate|public_production)" >&2; exit 1 ;; \
    esac \
 && yarn build \
 && test -f .next-build/standalone/apps/storefront/server.js \
 && (test -d .next-build/standalone/node_modules \
     || test -d .next-build/standalone/apps/storefront/node_modules) \
 && ! find .next-build/standalone -type l | grep -q . \
 && node -e 'const fs=require("fs"); const path=require("path"); const ev={woodright_image_build_profile:process.env.WOODRIGHT_IMAGE_BUILD_PROFILE||"",NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL||"",NEXT_PUBLIC_MEDUSA_BACKEND_URL:process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL||"",WOODRIGHT_LAUNCH_MODE:process.env.WOODRIGHT_LAUNCH_MODE||"",WOODRIGHT_PAYMENT_MODE:process.env.WOODRIGHT_PAYMENT_MODE||"",WOODRIGHT_RUNTIME_ROLE:process.env.WOODRIGHT_RUNTIME_ROLE||"",WOODRIGHT_DB_ALIAS:process.env.WOODRIGHT_DB_ALIAS||"",private_noindex:process.env.WOODRIGHT_LAUNCH_MODE||"",manual_invoice:process.env.WOODRIGHT_PAYMENT_MODE||""}; const body=JSON.stringify(ev,Object.keys(ev).sort(),2)+"\n"; for (const rel of [".next-build/standalone/woodright-bake-evidence.json",".next-build/static/woodright-bake-evidence.json"]) { fs.mkdirSync(path.dirname(rel),{recursive:true}); fs.writeFileSync(rel,body); console.log("wrote",rel);} ' \
 && ls -la .next-build/standalone/apps/storefront \
 && { du -sh .next-build/standalone .next-build/standalone/apps/storefront/node_modules .next-build/standalone/node_modules 2>/dev/null || true; }

FROM node:20-bookworm-slim AS runner
WORKDIR /workspace
# Re-declared so `docker image inspect` on the FINAL runtime image (not just
# the intermediate build stage) shows the build-time profile/role/exposure/db
# evidence used for check-global-lock-policy / cutover-production-candidate.sh
# read-only verification. Actual runtime behavior still comes from
# docker-compose env at container start (see apps/storefront/Dockerfile's
# build-stage ARG comments above).
ARG WOODRIGHT_IMAGE_BUILD_PROFILE=
ARG WOODRIGHT_RUNTIME_ROLE=
ARG WOODRIGHT_RUNTIME_EXPOSURE=
ARG WOODRIGHT_DB_ALIAS=
ARG WOODRIGHT_ADMIN_EXPOSURE=
ENV NODE_ENV=production \
    PORT=3002 \
    HOSTNAME=0.0.0.0 \
    NEXT_DIST_DIR=.next-build \
    WOODRIGHT_IMAGE_BUILD_PROFILE=$WOODRIGHT_IMAGE_BUILD_PROFILE \
    WOODRIGHT_RUNTIME_ROLE=$WOODRIGHT_RUNTIME_ROLE \
    WOODRIGHT_RUNTIME_EXPOSURE=$WOODRIGHT_RUNTIME_EXPOSURE \
    WOODRIGHT_DB_ALIAS=$WOODRIGHT_DB_ALIAS \
    WOODRIGHT_ADMIN_EXPOSURE=$WOODRIGHT_ADMIN_EXPOSURE
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
