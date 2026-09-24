# HWDT Phase 1 backend: Node.js 22 + Express + TypeScript (executed with tsx)
# Build context: repository root (needs backend/ and database/)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY backend/src ./src
COPY database ./database
RUN addgroup -S hwdt && adduser -S hwdt -G hwdt && chown -R hwdt:hwdt /app
USER hwdt
ENV HWDT_DATABASE_DIR=/app/database HWDT_BACKEND_PORT=4000
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=10 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health | grep -q '"status":"ok"' || exit 1
CMD ["node", "--import", "tsx", "src/server.ts"]
