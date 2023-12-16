.ONESHELL:


build: build-image
	docker save -o ./synclink.img synclink:0.2.0

build-image: build-web
	docker build -t synclink:0.2.0 .

build-web: build-sha256-binding
	cd web && echo %cd%
	npm run build

build-sha256-binding:
	cd wasm/sha256 && echo %cd%
	wasm-pack build
	wasm-pack pack