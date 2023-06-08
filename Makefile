.ONESHELL:


dist: build-image
	docker save -o ./synclink.img synclink:latest

build-image: build-webapp
	docker build -t synclink .

build-webapp: build-sha256-binding
	cd webapp && echo %cd%
	npm run build

build-sha256-binding:
	cd wasm/sha256 && echo %cd%
	wasm-pack build
	wasm-pack pack