FROM node:26-alpine AS builder
LABEL maintainer="preston.lee@prestonlee.com"
WORKDIR /app

# Keep the workspace manifests and shared package together for a reproducible install.
COPY package.json package-lock.json ./
COPY core/package.json core/package.json
COPY core/tsconfig.json core/tsconfig.json
COPY core/src core/src
COPY server/package.json server/package.json
COPY ui/package.json ui/package.json
RUN npm ci --ignore-scripts

COPY ui ui
RUN npm run build --workspace=bibler-core && npm run build --workspace=bibler-ui

FROM nginx:stable-alpine
COPY ui/nginx.conf /etc/nginx/conf.d/default.conf
WORKDIR /usr/share/nginx/html
RUN rm -rf ./*
COPY --from=builder /app/ui/dist/bibler-ui .
ENV BIBLER_SERVER_URL=http://localhost:3000
CMD ["/bin/sh", "-c", "envsubst '${BIBLER_SERVER_URL}' < assets/configuration.template.js > assets/configuration.js && exec nginx -g 'daemon off;'"]
