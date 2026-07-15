FROM node:22-slim AS builder

WORKDIR /app

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
# 统一门户：刀具系统挂在 /tools/ 子路径
ARG VITE_BASE=/tools/
ENV VITE_BASE=${VITE_BASE}

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY src ./src

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY portal /usr/share/nginx/html
COPY --from=builder /app/dist /usr/share/nginx/html/tools

EXPOSE 80
