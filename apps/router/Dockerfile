FROM node:22-alpine AS base

# Build stage
FROM base AS builder
WORKDIR /app

# Install only the packages needed for build
RUN npm install hono @hono/node-server @supabase/supabase-js zod typescript @types/node

COPY tsconfig.build.json ./
COPY src/ ./src/
RUN npx tsc --project tsconfig.build.json

# Runtime stage
FROM node:22-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 router

COPY --from=builder --chown=router:nodejs /app/dist ./dist

# Install only production deps
RUN npm install hono @hono/node-server @supabase/supabase-js zod

USER router

EXPOSE 8081
ENV PORT=8081
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
