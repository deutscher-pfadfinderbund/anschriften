# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1a: Install dependencies with bun (the project's package manager).
# ---------------------------------------------------------------------------
FROM oven/bun:1.2 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 1b: Build the Next.js standalone bundle. Runs on Node because the
# standalone output targets the Node runtime; bun is only the installer.
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN node_modules/.bin/next build

# ---------------------------------------------------------------------------
# Stage 2: Fetch the pinned Typst release for the target architecture.
# The linux-musl builds are fully static, so the binary runs on the glibc
# runtime image below without extra shared libraries. TARGETARCH is provided
# by BuildKit (amd64 on the server, arm64 on Apple Silicon).
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS typst
ARG TARGETARCH
ARG TYPST_VERSION=0.15.0
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates wget xz-utils \
  && rm -rf /var/lib/apt/lists/*
# SHA256 of the official v0.15.0 release tarballs (verified 2026-07-04).
# Bump these together with TYPST_VERSION.
ARG TYPST_SHA256_AMD64=59b207df01be2dab9f13e80f73d04d7ff8273ffd46b3dd1b9eef5c60f3eeabea
ARG TYPST_SHA256_ARM64=cdf50ffc7b8ba759ed02200632eda3d78eb8b99aacb6611f4f75684990647620
RUN set -eux; \
  case "${TARGETARCH}" in \
    amd64) TYPST_ARCH=x86_64; TYPST_SHA256="${TYPST_SHA256_AMD64}" ;; \
    arm64) TYPST_ARCH=aarch64; TYPST_SHA256="${TYPST_SHA256_ARM64}" ;; \
    *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
  esac; \
  target="typst-${TYPST_ARCH}-unknown-linux-musl"; \
  wget -q "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/${target}.tar.xz"; \
  echo "${TYPST_SHA256}  ${target}.tar.xz" | sha256sum -c -; \
  tar -xf "${target}.tar.xz"; \
  install -m 0755 "${target}/typst" /usr/local/bin/typst; \
  /usr/local/bin/typst --version

# ---------------------------------------------------------------------------
# Stage 3: Runtime image (Next standalone server + Typst + PDF assets).
# ---------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    TYPST_FONT_PATHS=/app/src/pdf/fonts \
    PDF_ASSETS_DIR=/app/src/pdf

# Pinned Typst CLI used by the PDF export route.
COPY --from=typst /usr/local/bin/typst /usr/local/bin/typst

# Next.js standalone server + static assets.
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

# DB migrations + entrypoint script. drizzle-orm is dependency-free, so overlaying
# the whole package guarantees drizzle-orm/node-postgres/migrator is present — Next
# only traces the submodules the server actually imports, and the migrator is not one.
COPY --from=build --chown=node:node /app/drizzle ./drizzle
COPY --from=build --chown=node:node /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=node:node /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# PDF template, fonts and letterhead. compile.ts resolves these relative to
# process.cwd() (= /app) unless PDF_ASSETS_DIR overrides the base directory.
COPY --from=build --chown=node:node /app/src/pdf/templates ./src/pdf/templates
COPY --from=build --chown=node:node /app/src/pdf/fonts ./src/pdf/fonts
COPY --from=build --chown=node:node /app/src/pdf/assets ./src/pdf/assets

USER node
EXPOSE 3000

# Healthy as long as the server answers; redirects/404 still mean the process is up.
# Uses Node's global fetch, so no extra packages (wget/curl) are needed in the image.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

# Apply migrations, then start the server. `exec` hands PID 1 to node so it
# receives SIGTERM directly (graceful shutdown); the `&&` still aborts startup
# if the migration step fails.
CMD ["sh", "-c", "node scripts/migrate.mjs && exec node server.js"]
