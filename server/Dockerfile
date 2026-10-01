# 慢行产品 API 服务（含静态托管能力）
FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY server/src ./src
# 静态页面由 nginx 服务；此服务专注 /api/*
EXPOSE 3000
ENV PORT=3000 SLOW_DB=/data/slow.db
VOLUME ["/data"]
CMD ["sh", "-c", "node src/seed.js && node src/server.js"]
