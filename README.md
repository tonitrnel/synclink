# SyncLink

SyncLink 是一个设计用于运行在 NAS、软路由等类似设备上的且很简陋的程序，目的是在局域网内提供存储文本、图像、视频等文件来方便局域网其他设备访问。

![screenshot1](./docs/screenshot1.png)

## 功能

- 文件共享：支持文本、图像、音频等文件粘贴复制以及拖拽，方便用户在不同设备上共享。
- 实时更新：基于 SSE，用户能够接收到列表的实时变化。
- 本地 Hash 计算：所有上传的文件都会在本地计算 SHA-256 值再与服务端进行比较以去除上传重复的内容，其中对于小于 2 MB 的文件将使用浏览器 API 计算，大于等于 2MB 的文件将使用 Worker 计算。
- 分片上传：对于 2 MB 将会无痕上传，对于大于 100 MB 的文件将开启分片上传，并且支持断点续传
- 基于流传输：所有的文件都以流的形式返回或写入，服务端支持 http range 请求
- 本地存储：该项目采用 TOML 格式存储文件索引方便可读、迁移和修改

注意：本项目依赖浏览器一些特性，因此需要使用 HTTPS 环境上使用，建议使用 Nginx 转发

## 使用 Docker 安装使用

创建 data、logs 和 config 目录 和 配置文件

```shell
mv CUSTOM_DIR
mkdir data
mkdir config
mkdir logs
echo "" > ./config/synclink.conf
```

配置文件参考 [synclink-config.toml](./config/synclink-config.toml)

```shell
docker run -d \
        --name synclink \
        --network ptdg-network \
        --restart always \
        -v /<CUSTOM_DIR>/data:/etc/synclink/storage \
        -v /<CUSTOM_DIR>/config/synclink.conf:/etc/synclink/config.toml \
        -v /<CUSTOM_DIR>/logs:/etc/synclink/logs \
        ghcr.io/tonitrnel/synclink:0.2.2
```

### Nginx 配置参考

```text
server {
    listen 80;
    listen 443 ssl;
    server_name <YOUR_DOMAIN>;

    ssl_certificate <YOUR_CERT_PATH>;
    ssl_certificate_key <YOUR_CERT_KEY_PATH>;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";

    client_max_body_size 1g;

    location /api/notify {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
    }
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_intercept_errors on;
    }
}
```

## 技术栈

- 前端：使用 [TypeScript](https://www.typescriptlang.org/) 和 [React](https://react.dev/) 构建
- 后端：使用 [Rust](https://www.rust-lang.org/) 和 [Axum](https://github.com/tokio-rs/axum) 构建

## 前提条件

开发需要安装 [`NodeJS`](https://nodejs.org/en/download) 和 [`Rust`](https://www.rust-lang.org/tools/install)、[`WASM-Pack`](https://rustwasm.github.io/wasm-pack)

## 快速开始

以下是快速启动项目的步骤

1. 克隆项目代码

```bash
git clone https://github.com/tonitrnel/synclink
```

2. 安装依赖

```bash
# 进入 server 目录
cd server
cargo build
# 进入 WASM 目录
cd ../wasm/sha256
wasm-pack build
# 进入 web 目录
cd ../../web
npm install
```

3. 启动服务

```bash
# 启动前端开发服务器
cd web
npm run dev
# 启动后端服务
cd ../server
cargo run
```

4. 在浏览器访问

   [http://localhost:8081](http://localhost:3000)

## 配置

应用程序的配置位于 `config/synclink-config.toml` 文件中。您可以根据需要修改其参数

## 贡献

欢迎贡献代码，您可以通过以下步骤参与贡献：

1. Fork 本仓库
2. 创建您的分支：`git checkout -b feature/YourFeature`
3. 提交您的更改：`git commit -am 'feat: added feature'`
4. 推送到分支：`git push origin feature/YourFeature`
5. 提交 Pull Request

## 许可证

这个项目使用 MIT 许可证。更多信息请参阅 [LICENSE](LICENSE) 文件。
