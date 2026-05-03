FROM oven/bun:1 AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Build the SvelteKit frontend
RUN bun run build

# Build the Elysia backend into a standalone executable
RUN bun run build.ts

# Final production stage
FROM oven/bun:1-slim AS release
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy the compiled backend executable
COPY --from=builder /app/dist/server ./server

# Copy the SvelteKit build directory (required by the backend to serve the frontend)
COPY --from=builder /app/build ./build

EXPOSE 3000
CMD ["./server"]