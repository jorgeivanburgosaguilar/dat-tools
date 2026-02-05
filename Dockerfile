# Multi-stage production Dockerfile for SvelteKit static app
# Stage 1: Build the application
# Stage 2: Serve with nginx

# ============================================
# Stage 1: Builder
# ============================================
FROM node:lts-alpine AS builder

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

# Build the application (outputs to /app/build)
RUN pnpm run build

# ============================================
# Stage 2: Production Server
# ============================================
FROM nginx:alpine

# Copy built static files from builder stage
COPY --from=builder /app/build /usr/share/nginx/html

# Copy custom nginx configuration (optional - using default for now)
# If you need custom config, uncomment and create nginx.conf:
# COPY nginx.conf /etc/nginx/nginx.conf

# Expose port 80 (standard HTTP)
EXPOSE 8080

# nginx runs in foreground by default in this image
CMD ["nginx", "-g", "daemon off;"]
