.ONESHELL:
.EXPORT_ALL_VARIABLES:

PKG_VER        := $(shell cat ./server/Cargo.toml | grep "^version" | awk '{print $$3}' | sed 's/"//g')
COMMIT_ID      := $(shell git rev-parse --short=9 HEAD)
DOCKER_VERSION := $(shell docker --version | awk '{print $$3}' | sed 's/,//')
BUILD_DATE     := $(shell date '+%Y-%m-%d')
RUSTC_VERSION  := $(shell rustc --version | awk '{print $$2}')
SYSTEM_VERSION := $(shell lsb_release -si | tr -d '\n' && lsb_release -sr | cut -d. -f1)

DOCKER_REGISTRY := ghcr.io
DOCKER_ORG      := tonitrnel
DOCKER_IMAGE_NAME := $(DOCKER_REGISTRY)/$(DOCKER_ORG)/ephemera

build: build-image
	docker save -o ./ephemera_${PKG_VER}.img ephemera:$(PKG_VER)

build-image:
	docker build \
		--build-arg PKG_VER=$(PKG_VER) \
		--build-arg COMMIT_ID=$(COMMIT_ID) \
		--build-arg DOCKER_VERSION=$(DOCKER_VERSION) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		--build-arg RUSTC_VERSION=$(RUSTC_VERSION) \
		-t ephemera:$(PKG_VER) .

dev-server:
	cd server
	cargo build --package ephemera --bin ephemera --profile dev -- -c ../config/ephemera.conf

dev:
	cd web
	pnpm run dev

build-web: build-sha256-binding build-tar-binding
	cd web
	pnpm run build

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
	docker rmi --force $(DOCKER_IMAGE_NAME):$(PKG_VER)
	docker tag ephemera:$(PKG_VER) $(DOCKER_IMAGE_NAME):$(PKG_VER)

image-push:
	docker push $(DOCKER_IMAGE_NAME):$(PKG_VER)

run-debug-container:
	docker run -d -it --name ephemera-debug \
		-p 8080:8080 \
		-v ./config/ephemera-config.toml:/etc/ephemera/config.toml \
		-v ./storage:/app/storage \
		-v ./server/target/release/ephemera:/app/ephemera \
		-it debian /bin/bash
	docker exec ephemera-debug sh -c "apt update && apt install heaptrack -y"
	#cd /app && heaptrack ./ephemera -c /etc/ephemera/config.toml