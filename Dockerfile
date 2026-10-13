# LINDY OS — ảnh chạy thật trên Vibe Host Mắt Bão (cách làm như CEN WORK).
# Không có file này, Vibe Host tự dựng bằng Nixpacks và giữ cả node_modules trong ảnh (1,2 GB > hạn mức 1 GB).
# Tầng dựng có Bun và toàn bộ thư viện; tầng chạy chỉ có Node, .output (Nitro tự chứa thư viện lúc chạy),
# file migration và script chuẩn bị DB. Ảnh khoảng 250 MB.

# ---------- Dựng ----------
# Cùng phiên bản Bun với máy local để đọc đúng bun.lock.
FROM oven/bun:1.4.2 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
# vite.config.ts cố định preset node-server, nên dựng bằng Bun vẫn ra máy chủ chạy bằng Node.
ENV NODE_ENV=production
RUN bun run build
# Script chuẩn bị DB đóng gói thành một file, ảnh chạy không cần node_modules.
RUN bun build scripts/release.ts --target=node --outfile=/app/release.mjs

# ---------- Chạy ----------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/db/migrations ./db/migrations
COPY --from=builder /app/release.mjs ./release.mjs
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 3000
# Chuẩn bị DB (role, migration, dữ liệu nền) rồi mới bật server. Lỗi thì container dừng,
# Vibe Host giữ bản đang chạy và lỗi hiện trong nhật ký triển khai.
ENTRYPOINT ["/bin/sh", "-c", "node release.mjs && exec node .output/server/index.mjs"]
