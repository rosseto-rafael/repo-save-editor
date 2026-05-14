# syntax=docker/dockerfile:1.7

# Stage 1: build the static SPA
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY tsconfig*.json vite.config.ts postcss.config.js eslint.config.js index.html ./
COPY src ./src
COPY public ./public

RUN npm run build

# Stage 2: serve via nginx
FROM nginx:alpine AS runtime

RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
