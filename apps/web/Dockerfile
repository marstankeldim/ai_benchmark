# EvalForge dashboard (Next.js). Built from the monorepo root context so the
# workspace resolves; see docker-compose.yml (`web` profile).

FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY benchmarks ./benchmarks
COPY apps ./apps
COPY scripts ./scripts
RUN npm ci
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace @evalforge/web

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /app /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npm", "run", "start"]
