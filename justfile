set shell := ["bash", "-c"]

# List all available recipes
default:
    @just --list

# Generate the schema
generate:
    bunx zen generate --output ./src/lib/zenstack

# Start the frontend dev server
dev:
    bun --bun vite dev

# Start the backend server in watch mode
serve:
    bun run --watch src/server.ts

# Format the codebase using oxfmt
fmt:
    bunx oxfmt

# Lint the codebase using oxlint
lint:
    bunx oxlint --type-aware

# Run Svelte type checking
check:
    bun run svelte-kit sync
    bun run svelte-check --tsconfig ./tsconfig.json

# Run Svelte type checking in watch mode
check-watch:
    bun run svelte-kit sync
    bun run svelte-check --tsconfig ./tsconfig.json --watch

# Run unit tests
test:
    bun run vitest --run

# Run unit tests in watch mode
test-watch:
    bun run vitest

# Build the frontend using Vite
build-frontend:
    bun run vite build

# Build the backend executable using Bun
build-backend:
    bun run build.ts

# Build both frontend and backend
build: build-frontend build-backend

# Build the Docker image
docker-build:
    docker build -t svelysia .

# Run the Docker container
docker-run:
    docker run -p 3000:3000 --env-file .env --name svelysia svelysia

docker-stop:
    docker stop svelysia
    docker rm svelysia