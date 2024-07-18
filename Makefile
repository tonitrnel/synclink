.ONESHELL:

PKG_VER        := $(shell cat ./server/Cargo.toml | grep "^version" | awk '{print $$3}' | sed 's/"//g')
COMMIT_ID      := $(shell git rev-parse --short=9 HEAD)
DOCKER_VERSION := $(shell docker --version | awk '{print $$3}' | sed 's/,//')
BUILD_DATE     := $(shell date '+%Y-%m-%d')
RUSTC_VERSION  := $(shell rustc --version | awk '{print $$2}')

build: build-image image-tag
	docker save -o ./synclink_${PKG_VER}.img synclink:$(PKG_VER)

build-image:
	docker build \
		--build-arg PKG_VER=$(PKG_VER) \
		--build-arg COMMIT_ID=$(COMMIT_ID) \
		--build-arg DOCKER_VERSION=$(DOCKER_VERSION) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		--build-arg RUSTC_VERSION=$(RUSTC_VERSION) \
		-t synclink:$(PKG_VER) .

build-web: build-sha256-binding build-tar-binding
	cd web
	npm run build

build-sha256-binding:
	cd wasm/sha256
	wasm-pack build
	wasm-pack pack

build-tar-binding:
	cd wasm/tar
	wasm-pack build
	wasm-pack pack

image-tag:
	docker rmi --force ghcr.io/tonitrnel/synclink:$(PKG_VER)
	docker tag synclink:$(PKG_VER) ghcr.io/tonitrnel/synclink:$(PKG_VER)

image-push:
	docker push ghcr.io/tonitrnel/synclink:$(PKG_VER)