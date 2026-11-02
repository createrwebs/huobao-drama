# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim
ARG HUOBAO_VERSION=4.0.8
ENV NODE_ENV=production \
    HUOBAO_VERSION=${HUOBAO_VERSION} \
    PORT=5679 \
    FFMPEG_BIN=/usr/local/bin/ffmpeg \
    FFPROBE_BIN=/usr/local/bin/ffprobe \
    HUOBAO_DATA_DIR=/app/data \
    SQLITE_PATH=/app/data/huobao.sqlite3 \
    WORKSPACE_PATH=/app/data/workspace \
    FRONTEND_DIST=/app/frontend-dist \
    PUBLIC_BASE_URL=https://www.toraapi.com/storyvdo

# 复制静态 ffmpeg / ffprobe（约 40MB，无需安装 170+ Debian 桌面依赖）
COPY --from=mwader/static-ffmpeg:latest /ffmpeg /ffprobe /usr/local/bin/

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend \
  && node -e "const fs=require('fs');const l=JSON.parse(fs.readFileSync('package-lock.json'));for(const p of Object.values(l.packages||{}))delete p.resolved;fs.writeFileSync('package-lock.json',JSON.stringify(l,null,2))" \
  && npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmjs.org \
  && rm -rf node_modules/ffmpeg-static/ffmpeg* node_modules/ffprobe-static/bin /root/.npm

COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/workspace ./workspace-template
COPY frontend/dist ./frontend-dist
COPY worker ./worker
COPY docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /app/data

VOLUME ["/app/data"]
EXPOSE 5679

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||5679)+'/storyvdo/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./entrypoint.sh"]
