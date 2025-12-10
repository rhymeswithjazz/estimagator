#!/bin/bash
set -e

# =============================================================================
# Build and Push Estimagator Docker Images
# =============================================================================
# Usage: ./scripts/build-and-push.sh [version]
# Example: ./scripts/build-and-push.sh 1.0.0
#
# Prerequisites:
#   - Docker logged in: docker login
#   - Run from project root directory
#   - Docker buildx available (included in Docker Desktop)
# =============================================================================

DOCKERHUB_USER="rhymeswithjazz"
VERSION="${1:-latest}"
PLATFORM="linux/amd64"

echo "========================================"
echo "Building Estimagator Images"
echo "Version: $VERSION"
echo "Platform: $PLATFORM"
echo "========================================"

# Ensure buildx builder exists
if ! docker buildx inspect estimagator-builder &>/dev/null; then
    echo "Creating buildx builder..."
    docker buildx create --name estimagator-builder --use
fi
docker buildx use estimagator-builder

# Build and push API image
echo ""
echo "Building and pushing API image..."
docker buildx build \
    --platform "$PLATFORM" \
    -t "$DOCKERHUB_USER/estimagator-api:$VERSION" \
    -t "$DOCKERHUB_USER/estimagator-api:latest" \
    -f src/backend/PokerPoints/Dockerfile \
    --push \
    src/backend/PokerPoints

# Build and push Frontend image
echo ""
echo "Building and pushing Frontend image..."
docker buildx build \
    --platform "$PLATFORM" \
    -t "$DOCKERHUB_USER/estimagator-frontend:$VERSION" \
    -t "$DOCKERHUB_USER/estimagator-frontend:latest" \
    -f src/frontend/poker-points-app/Dockerfile \
    --push \
    src/frontend/poker-points-app

echo ""
echo "========================================"
echo "Done!"
echo "========================================"
echo ""
echo "Images pushed:"
echo "  - $DOCKERHUB_USER/estimagator-api:$VERSION"
echo "  - $DOCKERHUB_USER/estimagator-api:latest"
echo "  - $DOCKERHUB_USER/estimagator-frontend:$VERSION"
echo "  - $DOCKERHUB_USER/estimagator-frontend:latest"
echo ""
echo "Deploy to Portainer using: docker/stack.yml"
