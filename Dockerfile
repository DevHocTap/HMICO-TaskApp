# API HMICO — image production (15/09/2026).
# Hai tầng: build (cần devDependencies để `nest build`) và chạy.
# Tầng chạy cài postgresql-client-16 để sao lưu chế độ `local` gọi được
# pg_dump / pg_restore ĐÚNG BẢN 16 với database.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Dự phòng argon2 không tải được prebuild thì tự biên dịch
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
# DATABASE_URL giả chỉ để prisma.config.ts không thiếu biến lúc generate
RUN DATABASE_URL=postgresql://x:x@localhost:5432/x npx prisma generate && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
  && apt-get purge -y gnupg && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY prisma.config.ts package.json ./
COPY deploy/api-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /backups /backups-mirror
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD curl -fs http://localhost:3000/ || exit 1
CMD ["/entrypoint.sh"]
