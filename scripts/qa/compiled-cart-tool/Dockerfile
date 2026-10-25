# LOCAL PROPOSAL. No build/pull/push authorized or performed.
FROM --platform=linux/arm64 mcr.microsoft.com/playwright@sha256:969a9e3655576186a7f3b3d85502f8c4041f4afce571df7aadba6384d93ee61f
USER root
WORKDIR /opt/woodright-cart-probe
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 PLAYWRIGHT_BROWSERS_PATH=/ms-playwright HOME=/tmp NODE_OPTIONS=--max-old-space-size=192
COPY package.json package-lock.json SDK-INTEGRITY.lock.json verify-sdk-lock.cjs ./
RUN node verify-sdk-lock.cjs metadata --build-bounds \
 && npm ci --ignore-scripts --omit=dev --no-audit --no-fund --fetch-retries=0 --fetch-timeout=30000 --registry=https://registry.npmjs.org --cache=/tmp/wr-tool-npm-cache \
 && node verify-sdk-lock.cjs installed --build-bounds \
 && rm -rf /tmp/wr-tool-npm-cache
COPY offline-probe.cjs ./
LABEL io.woodright.qa.tool="compiled-cart" io.woodright.qa.sdk="playwright-core@1.64.1" io.woodright.qa.browser="chromium@1248" io.woodright.qa.base="sha256:969a9e3655576186a7f3b3d85502f8c4041f4afce571df7aadba6384d93ee61f"
ENV NPM_CONFIG_OFFLINE=true
USER 10001:10001
ENTRYPOINT ["node"]
CMD ["/opt/woodright-cart-probe/offline-probe.cjs"]
