.ONESHELL:
.EXPORT_ALL_VARIABLES:

PKG_VER        := $(shell cat ./server/Cargo.toml | grep "^version" | awk '{print $$3}' | sed 's/"//g')
COMMIT_ID      := $(shell git rev-parse --short=9 HEAD)
DOCKER_VERSION := $(shell docker --version | awk '{print $$3}' | sed 's/,//')
BUILD_DATE     := $(shell date '+%Y-%m-%d')
RUSTC_VERSION  := $(shell rustc --version | awk '{print $$2}')
SYSTEM_VERSION := $(shell lsb_release -si | tr -d '\n' && lsb_release -sr | cut -d. -f1)

build: build-image image-tag
	docker save -o ./cedasync_${PKG_VER}.img cedasync:$(PKG_VER)

build-image:
	docker build \
		--build-arg PKG_VER=$(PKG_VER) \
		--build-arg COMMIT_ID=$(COMMIT_ID) \
		--build-arg DOCKER_VERSION=$(DOCKER_VERSION) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		--build-arg RUSTC_VERSION=$(RUSTC_VERSION) \
		-t cedasync:$(PKG_VER) .

build-web: build-sha256-binding build-tar-binding
	cd web
	npm run build

build-server:
	cd server
	cargo build --release

build-sha256-binding:
	cd wasm/sha256
	wasm-pack build
	wasm-pack pack

build-tar-binding:
	cd wasm/tar
	wasm-pack build
	wasm-pack pack

image-tag:
	docker rmi --force ghcr.io/tonitrnel/cedasync:$(PKG_VER)
	docker tag cedasync:$(PKG_VER) ghcr.io/tonitrnel/cedasync:$(PKG_VER)

image-push:
	docker push ghcr.io/tonitrnel/cedasync:$(PKG_VER)

setup-cedasync-debug:
	docker run -d -it --name cedasync-debug \
		-p 8080:8080 \
		-v ./config/cedasync-config.toml:/etc/cedasync/config.toml \
		-v ./storage:/app/storage \
		-v ./server/target/release/cedasync:/app/cedasync \
		-it debian /bin/bash
	docker exec cedasync-debug sh -c "apt update && apt install heaptrack -y"
	docker exec cedasync-debug sh -c "cd /app && heaptrack ./cedasync -c /etc/cedasync/config.toml"