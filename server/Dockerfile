# Build from the monorepo root: docker build -f server/Dockerfile .
FROM node:26-trixie-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY core/package.json core/tsconfig.json ./core/
COPY core/src ./core/src
COPY server/package.json server/tsconfig.json server/prisma.config.ts ./server/
COPY server/prisma ./server/prisma
COPY server/src ./server/src
COPY ui/package.json ./ui/
RUN npm ci --workspace=bibler-core --workspace=bibler-server --include-workspace-root --ignore-scripts
RUN npm run build --workspace=bibler-core && npm run build --workspace=bibler-server
# Prisma CLI is a production dependency because startup performs verified migrations.
RUN npm prune --omit=dev --workspace=bibler-core --workspace=bibler-server --include-workspace-root --ignore-scripts \
    && mkdir -p /app/server/node_modules

FROM node:26-trixie-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production BIBLER_SERVER_PORT=3000
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/core/package.json ./core/
COPY --from=builder /app/core/dist ./core/dist
COPY --from=builder /app/server/package.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/server/prisma.config.ts ./server/
WORKDIR /app/server
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
USER node
CMD ["node", "dist/index.js"]
