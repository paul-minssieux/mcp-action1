# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Install all dependencies (including dev) for the TypeScript build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies so only production deps are copied into the runtime image.
RUN npm prune --omit=dev

# --- Runtime stage -----------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    MCP_TRANSPORT=http \
    PORT=3000

# Copy production artefacts only.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run as the unprivileged `node` user shipped with the base image.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
