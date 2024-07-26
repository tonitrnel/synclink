# Server
FROM rust:1.79-alpine3.20 as ServerBuilder

WORKDIR /app

ARG PKG_VER
ARG COMMIT_ID
ARG BUILD_DATE
ARG DOCKER_VERSION
ARG RUSTC_VERSION

ENV PKG_VER=$PKG_VER
ENV COMMIT_ID=$COMMIT_ID
ENV BUILD_DATE=$BUILD_DATE
ENV RUSTC_VERSION=$RUSTC_VERSION
ENV DOCKER_VERSION=$DOCKER_VERSION
ENV SYSTEM_VERSION=alpine3.20

RUN apk update && apk add --no-cache -U musl-dev

RUN rustup upgrade

COPY server /app

RUN cargo build --release

# Wasm dependencies
FROM rust:1.79 as WasmBuilder
# It is not compiled for the Linux platform, and using Alpine will cause the download of `wasm-opt` dependencies' binary files to fail.

WORKDIR /app

RUN rustup upgrade

RUN cargo install wasm-pack

# Copy wasm sha256 project
COPY wasm/sha256 /app/sha256

# Copy wasm tar project
COPY wasm/tar /app/tar

# Build to wasm
WORKDIR /app/sha256
RUN wasm-pack build

# Build to wasm
WORKDIR /app/tar
RUN wasm-pack build

# Web
FROM node:alpine AS WebBuilder

WORKDIR /app

COPY web /app/web
COPY --from=WasmBuilder /app/sha256/pkg /app/wasm/sha256/pkg
COPY --from=WasmBuilder /app/tar/pkg /app/wasm/tar/pkg

WORKDIR /app/web

RUN npm install
RUN npm run build

# Final
FROM alpine:latest

WORKDIR /app

RUN mkdir "/etc/cedasync"
RUN mkdir "/var/log/cedasync"

COPY --from=ServerBuilder /app/target/release/cedasync .

COPY --from=WebBuilder /app/web/dist /app/public

COPY config/cedasync-config.toml /etc/cedasync/config.toml

COPY debian/etc/logrotate.d/cedasync /etc/logrotate.d/cedasync

EXPOSE 8080

RUN chmod +x ./cedasync

ENTRYPOINT ["./cedasync"]

CMD ["-c", "/etc/cedasync/config.toml"]