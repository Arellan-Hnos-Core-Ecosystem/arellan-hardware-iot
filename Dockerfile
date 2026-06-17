# syntax=docker/dockerfile:1
# Build context: raiz del ecosistema (../ desde arellan-infrastructure)

# ---------- Stage 1: builder ----------
FROM node:24-alpine AS builder
WORKDIR /workspace/arellan-hardware-iot

COPY arellan-hardware-iot/package.json arellan-hardware-iot/package-lock.json ./
RUN npm install --no-audit --no-fund

COPY arellan-hardware-iot/. .
RUN npm run build

# ---------- Stage 2: runner ----------
FROM node:24-alpine AS runner
WORKDIR /workspace/arellan-hardware-iot
ENV NODE_ENV=production

COPY arellan-hardware-iot/package.json arellan-hardware-iot/package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=builder /workspace/arellan-hardware-iot/dist ./dist

EXPOSE 3007
CMD ["node", "dist/main"]
