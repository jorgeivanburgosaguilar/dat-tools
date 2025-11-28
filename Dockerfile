# Development Dockerfile for Svelte/SvelteKit application
# Designed for agentic coding with live code updates

FROM node:lts-alpine

# Install wget for pnpm installation
RUN apk add --no-cache wget

# Install pnpm using standalone script (recommended for Docker)
RUN wget -qO- https://get.pnpm.io/install.sh | ENV="$HOME/.shrc" SHELL="$(which sh)" sh -

# Add pnpm to PATH
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Set working directory
WORKDIR /app

# Copy source code
COPY . .

# Install dependencies fresh (node_modules excluded via .dockerignore)
RUN pnpm install

# Expose Vite dev server port
EXPOSE 5173

# Start development server with host binding for external access
CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0"]
