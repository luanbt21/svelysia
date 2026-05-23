# Svelysia

A modern, high-performance full-stack web application template combining **SvelteKit** and **ElysiaJS**, powered by **Bun**.

## Tech Stack

- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Frontend**: [SvelteKit](https://kit.svelte.dev/)
- **Backend**: [ElysiaJS](https://elysiajs.com/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Deployment**: Docker (Multi-stage build)

## Getting Started

### Prerequisites

- Install [Bun](https://bun.sh/)
- Install [Just](https://github.com/casey/just) (optional, but recommended for running commands)

### Installation

Clone the repository and install dependencies:

```sh
bun install
```

### Development

This project consists of a SvelteKit frontend and an ElysiaJS backend.

To start the development environments, run the following commands in separate terminal windows:

**Frontend (Vite dev server):**

```sh
just dev
# or: bun --bun vite dev
```

**Backend (Elysia watcher):**

```sh
just serve
# or: bun run --watch src/server.ts
```

## Available Commands

We use a `justfile` to manage project commands efficiently. Run `just` to see all available recipes:

```sh
just build          # Build both frontend and backend
just build-backend  # Build the backend executable using Bun
just build-frontend # Build the frontend using Vite
just check          # Run Svelte type checking
just check-watch    # Run Svelte type checking in watch mode
just dev            # Start the frontend dev server
just docker-build   # Build the Docker image
just docker-run     # Run the Docker container
just fmt            # Format the codebase using oxfmt
just lint           # Lint the codebase using oxlint
just serve          # Start the backend server in watch mode
just test           # Run unit tests
just test-watch     # Run unit tests in watch mode
```

## Production & Deployment

This project includes a multi-stage `Dockerfile` optimized for production. It builds the SvelteKit frontend and runs the backend natively using the lightweight `oven/bun:1-slim` image.

To build the Docker image locally:

```sh
just docker-build
# or: docker build -t svelysia .
```

To run the Docker container:

```sh
just docker-run
# or: docker run -p 3000:3000 --env-file .env svelysia
```

## Environment Variables

Make sure to configure your environment variables before running in production. You can use a `.env` file for local development and testing.

```env
PORT=3000
DATABASE_URL=...
ENABLE_TRACING=false
# Other OpenObserve or external variables...
```
