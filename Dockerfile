FROM rust:1.75-alpine3.18 as builder

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
ENV SYSTEM_VERSION=alpine3.18

RUN apk update && apk add --no-cache -U musl-dev

RUN rustup upgrade

COPY server/src ./src
COPY server/Cargo.toml ./
COPY server/Cargo.lock ./

RUN cargo build --release

FROM alpine:latest

WORKDIR /app

RUN mkdir "/etc/synclink"
RUN mkdir "/var/log/synclink"

COPY --from=builder /app/target/release/synclink .

COPY web/dist /app/public

COPY config/synclink-config.toml /etc/synclink/config.toml

COPY ./debian/etc/logrotate.d/synclink /etc/logrotate.d/synclink

EXPOSE 8080

RUN chmod +x ./synclink

ENTRYPOINT ["./synclink"]

CMD ["-c", "/etc/synclink/config.toml"]