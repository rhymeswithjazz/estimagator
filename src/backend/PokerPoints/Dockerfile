# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0-alpine AS build
WORKDIR /src

# Copy solution and project files first for layer caching
COPY PokerPoints.sln .
COPY PokerPoints.Api/PokerPoints.Api.csproj PokerPoints.Api/
COPY PokerPoints.Data/PokerPoints.Data.csproj PokerPoints.Data/

# Restore dependencies
RUN dotnet restore

# Copy remaining source and build
COPY . .
RUN dotnet publish PokerPoints.Api/PokerPoints.Api.csproj -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy published app
COPY --from=build /app/publish .

# Set ownership and switch to non-root user
RUN chown -R appuser:appgroup /app
USER appuser

# Expose port (internal, Synology proxy handles external)
EXPOSE 5000

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

ENTRYPOINT ["dotnet", "PokerPoints.Api.dll"]
