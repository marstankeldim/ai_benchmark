# EvalForge API + engine image.
#
# The engine runs TypeScript directly via tsx (no build step), and includes
# python3 so the HumanEval code-execution evaluator works out of the box. For a
# hardened deployment, run coding benchmarks with EVALFORGE_SANDBOX=docker so each
# submission executes in its own ephemeral container instead.

FROM node:22-slim AS base
WORKDIR /app

# python3 for the local code-execution sandbox.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching. Workspace manifests must
# all be present before `npm ci` can resolve the workspace graph.
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY benchmarks ./benchmarks
COPY apps ./apps
COPY scripts ./scripts
RUN npm ci

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000
EXPOSE 4000

# Default: the REST API. Override the command to run the CLI, e.g.
#   docker run --rm evalforge npm run cli -- run --benchmark gsm8k --model mock:strong
CMD ["npm", "run", "start", "--workspace", "@evalforge/api"]
