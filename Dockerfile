FROM rust:1.74-alpine3.17 as builder

WORKDIR /app

RUN apk update && apk add --no-cache -U musl-dev

RUN rustup upgrade

COPY server/src ./src
COPY server/Cargo.toml ./
COPY server/Cargo.lock ./

RUN cargo build --release

FROM alpine:latest

WORKDIR /etc/synclink

COPY --from=builder /app/target/release/synclink .

COPY web/dist ./public

COPY config/synclink-config.toml ./config.toml

EXPOSE 8080

RUN chmod +x ./synclink

ENTRYPOINT ["./synclink"]

CMD ["-c", "./config.toml"]