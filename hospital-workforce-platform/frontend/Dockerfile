# HWDT Phase 1 frontend: Next.js (React + TypeScript), standalone output
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S hwdt && adduser -S hwdt -G hwdt
COPY --from=build --chown=hwdt:hwdt /app/.next/standalone ./
COPY --from=build --chown=hwdt:hwdt /app/.next/static ./.next/static
COPY --from=build --chown=hwdt:hwdt /app/public ./public
USER hwdt
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=5 CMD wget -qO- http://127.0.0.1:3000/login >/dev/null || exit 1
CMD ["node", "server.js"]
