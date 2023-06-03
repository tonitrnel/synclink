# SyncLink

SyncLink 是一个简洁的用于快速存储文本、图像和文件以方便其他设备访问的 WEB 程序。

## 功能

- 文件共享：支持文本图像快速粘贴复制以及，方便用户在不同设备上共享
- 实时通知：通过 SSE 技术，用户能够接收到文件状态更新、新文件的通知等
- 搜索功能：提供便捷的搜索功能，帮助用户快速找到所需的文件和文本内容。

## 技术栈

- 前端：使用 Vite、TypeScript 和 React 构建的前端应用程序
- 后端：使用 Rust 和 Axum 构建后端服务

## 前提条件

开发需要安装 `NodeJS` 和 `Rust`、`WASM-Pack`

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
cd ../wasm
wasm-pack build
# 进入 webapp 目录
cd ../webapp
npm install
```

3. 启动服务

```bash
# 启动前端开发服务器
cd webapp
npm run dev
# 启动后端服务
cd ../server
cargo run
```

4. 在浏览器访问

[http://localhost:8081](http://localhost:3000)

## 配置

应用程序的配置位于 `synclink-config.toml` 文件中。您可以根据需要修改其参数

## 贡献

欢迎贡献代码，您可以通过以下步骤参与贡献：

1. Fork 本仓库
2. 创建您的分支：`git checkout -b feature/YourFeature`
3. 提交您的更改：`git commit -am '添加新功能'`
4. 推送到分支：`git push origin feature/YourFeature`
5. 提交 Pull Request

## 许可证

这个项目使用 MIT 许可证。更多信息请参阅 [LICENSE](LICENSE) 文件。