# One image, one process, one port.
#
# The client is built here and served by the same Node process that runs the
# room socket, so deploying Senja is deploying one thing. Two services would
# mean two to keep alive and a WebSocket-upgrade problem sitting between
# them — and most instant tunnels will only forward one port anyway.

FROM node:22-alpine AS build
WORKDIR /app
# Dependencies first: this layer only rebuilds when the manifest changes,
# not on every edit to the game.
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY src ./src
COPY tsconfig.json ./

# Player profiles live here. Mount a volume on it or every deploy starts
# everyone from zero.
ENV SENJA_DATA=/data/players.json
VOLUME /data

# Hosts hand the port in as PORT; the server reads it, falling back to 8787.
ENV PORT=8080
EXPOSE 8080

# Run as the image's own unprivileged user rather than root.
USER node

CMD ["npm", "run", "start"]
