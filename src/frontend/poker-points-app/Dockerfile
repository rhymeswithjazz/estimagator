# Build stage
FROM node:22-alpine AS build
WORKDIR /app

# Copy package files for layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source and build for production
COPY . .
RUN npm run build -- --configuration=production

# Runtime stage - nginx unprivileged for non-root execution
FROM nginxinc/nginx-unprivileged:alpine AS runtime

# Switch to root to fix permissions for custom UID
USER root

# Copy custom nginx config
COPY nginx.conf /etc/nginx/nginx.conf

# Copy built Angular app
COPY --from=build /app/dist/poker-points-app/browser /usr/share/nginx/html

# Make nginx config and content readable by any user
RUN chmod -R 755 /etc/nginx && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod -R 777 /var/cache/nginx && \
    chmod -R 777 /var/log/nginx

# Switch back to non-root (will be overridden by docker-compose user directive)
USER 1026:100

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
