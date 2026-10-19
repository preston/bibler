FROM node:26-alpine AS builder
LABEL maintainer="preston.lee@prestonlee.com"

# Install dependencies first so they layer can be cached across builds.
RUN mkdir /app
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm i

# Build
COPY . .
RUN npm run ng build --production

FROM nginx:stable-alpine

# We need to make a few changes to the default configuration file.
COPY nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# Remove any default nginx content
RUN rm -rf *

# Copy build from "builder" stage, as well as runtime configuration script public folder
COPY --from=builder /app/dist/bibler-ui .

# CMD ["./configure-from-environment.sh", "&&", "exec", "nginx", "-g", "'daemon off;'"]
CMD envsubst < assets/configuration.template.js > assets/configuration.js  && exec nginx -g 'daemon off;'
