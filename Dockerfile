# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for TensorFlow and other native modules
RUN apk add --no-cache python3 make g++

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Install FFmpeg and production-only dependencies
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/package.json /app/yarn.lock ./
RUN yarn install --production --frozen-lockfile

COPY --from=builder /app/dist ./dist

# Create tmp folder recursively for transcoding
RUN mkdir -p /app/tmp && chmod 777 /app/tmp

EXPOSE 9000

CMD ["node", "dist/main"]
