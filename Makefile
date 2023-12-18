.ONESHELL:

VERSION := 0.2.1

build: build-image image-tag
	docker save -o ./synclink.img synclink:$(VERSION)

build-image: build-web
	docker build -t synclink:$(VERSION) .

build-web: build-sha256-binding
	cd web && echo %cd%
	npm run build

build-sha256-binding:
	cd wasm/sha256 && echo %cd%
	wasm-pack build
	wasm-pack pack

image-tag:
	docker rmi --force ghcr.io/tonitrnel/synclink:$(VERSION)
	docker tag synclink:$(VERSION) ghcr.io/tonitrnel/synclink:$(VERSION)

image-push:
	docker push ghcr.io/tonitrnel/synclink:$(VERSION)