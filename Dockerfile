# Server
FROM rust:1.80-alpine3.20 as ServerBuilder

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
ENV VIPS_VERSION=8.15.3

RUN apk add --update --no-cache \
    --repository=https://dl-cdn.alpinelinux.org/alpine/v3.20/main \
    --repository=https://dl-cdn.alpinelinux.org/alpine/v3.20/community \
    bash wget meson ninja pkgconf \
    build-base clang clang-libclang \
    expat-dev glib-dev gobject-introspection-dev \
    libheif-dev \
    libimagequant-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    libwebp-dev \
    lcms2-dev tiff-dev

WORKDIR /

RUN wget https://github.com/libvips/libvips/releases/download/v${VIPS_VERSION}/vips-${VIPS_VERSION}.tar.xz

RUN mkdir vips && tar xJf vips-${VIPS_VERSION}.tar.xz -C vips --strip-components 1 \
  && cd /vips \
  && meson setup build --buildtype=release \
  && cd /vips/build \
  && meson compile \
  && meson install \
  && ldconfig /etc/ld.so.conf.d \
  && rm -rf vips \
  && rm -f vips-${VIPS_VERSION}.tar.xz

WORKDIR /app

RUN rustup upgrade

COPY server /app

RUN RUSTFLAGS="-C target-feature=-crt-static $(pkgconf vips --libs)" cargo build  --release

# Wasm dependencies
FROM rust:1.80 as WasmBuilder
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
FROM node:20 AS WebBuilder

WORKDIR /app

COPY web /app/web
COPY --from=WasmBuilder /app/sha256/pkg /app/wasm/sha256/pkg
COPY --from=WasmBuilder /app/tar/pkg /app/wasm/tar/pkg

WORKDIR /app/web

RUN npm install
RUN npm run build

# Final
FROM alpine:3.20

WORKDIR /app

RUN mkdir "/etc/cedasync"
RUN mkdir "/var/log/cedasync"

COPY --from=ServerBuilder /usr/local/lib /usr/local/lib

RUN apk add --update --no-cache  \
    --repository=https://dl-cdn.alpinelinux.org/alpine/v3.20/main  \
    --repository=https://dl-cdn.alpinelinux.org/alpine/v3.20/community \
    expat glib \
    libheif \
    libimagequant \
    libjpeg-turbo \
    libpng \
    libwebp \
    libwebpmux libwebpdemux lcms2 tiff

COPY --from=ServerBuilder /app/target/release/cedasync .

COPY --from=WebBuilder /app/web/dist /app/public

COPY config/cedasync-config.toml /etc/cedasync/config.toml

COPY debian/etc/logrotate.d/cedasync /etc/logrotate.d/cedasync

EXPOSE 8080

RUN chmod +x ./cedasync

ENTRYPOINT ["./cedasync"]

CMD ["-c", "/etc/cedasync/config.toml"]