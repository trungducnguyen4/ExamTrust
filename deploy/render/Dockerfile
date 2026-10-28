# ExamTrust backend for Render (free web service).
# Build context is the repository root so the same BE/ sources as
# deploy/free/docker-compose.yml and BE/Dockerfile are used.

FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++ openssl

COPY BE/package.json BE/package-lock.json ./
COPY BE/prisma ./prisma
RUN npm ci

COPY BE/tsconfig.json BE/tsconfig.build.json BE/nest-cli.json ./
COPY BE/src ./src
COPY BE/scripts ./scripts

RUN npm run prisma:generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
COPY deploy/render/start.sh ./start.sh

RUN chmod +x ./start.sh && mkdir -p ./var/proctoring-evidence

# Render injects PORT (10000 by default); EXPOSE is documentation only.
EXPOSE 10000
CMD ["./start.sh"]
