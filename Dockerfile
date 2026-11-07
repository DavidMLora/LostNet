FROM node:24.16.0-alpine AS build
WORKDIR /app
ENV ASTRO_TELEMETRY_DISABLED=1 NPM_CONFIG_CACHE=/app/.ci-local/npm-cache
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY astro.config.mjs tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM nginx:stable-alpine AS runtime
LABEL org.opencontainers.image.source="https://github.com/DavidMLora/LostNet"
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
