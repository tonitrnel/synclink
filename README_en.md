# Ephemera ✨ (Actively Developing)

**Ephemera: Your Self-Hosted, Privacy-Focused File Sharing Hub Between Devices.**

Tired of cumbersome cables, cloud service logins, or installing apps just to quickly share a file, link, or note between your phone, laptop, and desktop? Ephemera runs on your own hardware (NAS, Raspberry Pi, router, etc.) providing a seamless, **browser-based drag-and-drop experience** for temporary storage and file transfers – all without vendor lock-in or privacy concerns.

Built with **Rust 🦀 + React ⚛️ + WebAssembly 🕸️** for performance and modern web capabilities.

[![GitHub Stars](https://img.shields.io/github/stars/tonitrnel/ephemera?style=social)](https://github.com/tonitrnel/ephemera/stargazers)
[![GitHub Issues](https://img.shields.io/github/issues/tonitrnel/ephemera)](https://github.com/tonitrnel/ephemera/issues)
[![License](https://img.shields.io/github/license/tonitrnel/ephemera)](LICENSE)
<!-- [![Build Status](...) Add build status badge if you have CI -->

<!-- 💡 **Highly Recommended:** Add a short GIF demo here showing drag-and-drop and key features! -->
<!-- ![Ephemera Demo GIF](./docs/demo.gif) -->

![screenshots](./docs/screenshot1.png)
<!-- Consider adding 1-2 more screenshots showcasing different features or responsive views -->

## ✨ Key Features & Technical Highlights

Ephemera leverages modern web technologies to deliver a powerful and efficient file sharing experience:

**🚀 High-Performance File Handling:**

*   **Blazing Fast Uploads:** Drag & drop files/folders directly into the browser.
*   **Client-Side Hashing (Wasm):** Efficiently detects duplicate files **before upload** using SHA-256 calculated *in the browser* via **Rust compiled to WebAssembly**. Avoids unnecessary network traffic. (Utilizes Web Workers for files >= 2MB).
*   **Chunking & Resumable Uploads:** Large files (> 100MB) are automatically chunked and support resumable uploads, ensuring reliability over unstable connections.
*   **Browser Folder Packing (Wasm):** Supports **uploading entire folders** by packing them into a `.tar` archive *directly in the browser* using **Rust compiled to WebAssembly**. (Chrome/Chromium recommended for full compatibility).
*   **Efficient Streaming:** Both backend (Rust/Axum) and frontend leverage streaming APIs (HTTP Range requests, Tar stream reading) for memory-efficient handling of large files and archives.

**💻 Seamless Cross-Device Experience:**

*   **Instant Text/Image Sharing:** Simply paste text or images directly into the Ephemera interface.
*   **Real-time Updates (SSE):** File list changes are instantly reflected across all connected clients via Server-Sent Events.
*   **Web-Based, No Installs:** Access Ephemera from any modern browser on any device on your local network (or remotely via reverse proxy).

**🔒 Privacy & Control (Ongoing Development):**

*   **Self-Hosted:** Your data stays on **your own hardware**.
*   **Simple File Index:** Uses a human-readable TOML file for the index (Future: Migrating to SQLite for richer features like multi-user support).
*   **(TODO) Multi-User Support:** Planned support for separate public and private user spaces using SQLite.
*   **(TODO) Client-Side Encryption Exploration:** Investigating **client-side encryption** using WebAssembly (SRP login, local file encryption) for **zero-knowledge** storage.

**🌐 Advanced Networking (Experimental):**

*   **Direct P2P Transfer (Experimental):** Exploring WebRTC and WebSocket for direct device-to-device file transfers (currently has issues, under active development/bug fixing).
*   **(TODO) Wget/Curl Friendly Downloads:** Planned support for easy command-line downloads.

**⚠️ Important Note:** Due to browser security features (like `SharedArrayBuffer` used by Wasm), Ephemera **must be served over HTTPS**. Using a reverse proxy like Nginx (see example below) is highly recommended for setting up SSL/TLS.

## 🐳 Docker Installation

1.  **Prepare Directories and Config:**
    ```bash
    export CUSTOM_DIR=/path/to/your/ephemera/data # Replace with your desired path
    mkdir -p $CUSTOM_DIR/data
    mkdir -p $CUSTOM_DIR/config
    mkdir -p $CUSTOM_DIR/logs
    # Copy or create your config file. Start with the example:
    # cp config/ephemera.conf.example $CUSTOM_DIR/config/ephemera.toml 
    touch $CUSTOM_DIR/config/ephemera.toml # Or create manually
    # Edit $CUSTOM_DIR/config/ephemera.toml according to your needs
    ```
    Refer to [`config/ephemera.conf.example`](./config/ephemera.conf.example) for configuration options.

2.  **Run the Docker Container:**
    ```bash
    docker run -d \
            --name ephemera \
            --restart always \
            -p 8080:8080 \ # Map the container port to your host port
            -v $CUSTOM_DIR/data:/app/storage \
            -v $CUSTOM_DIR/config/ephemera.toml:/app/config/ephemera.toml \
            -v $CUSTOM_DIR/logs:/app/logs \
            ghcr.io/tonitrnel/ephemera:latest # Or specify a version like 0.4.0
    ```
    Now access Ephemera via `http://<your-host-ip>:8080` (or via your reverse proxy if configured).

## 🔧 Nginx Reverse Proxy Example (Recommended for HTTPS)

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      "";
}

server {
    # Listen on port 80 and redirect to HTTPS
    listen 80;
    server_name your.domain.com; # Replace with your domain
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your.domain.com; # Replace with your domain

    # SSL Certificate paths
    ssl_certificate /path/to/your/fullchain.pem; # Replace with your cert path
    ssl_certificate_key /path/to/your/privkey.pem; # Replace with your key path

    # Security enhancements (recommended)
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers "EECDH+AESGCM:EDH+AESGCM:AES256+EECDH:AES256+EDH";
    # Add other security headers like HSTS if needed

    # Increase max body size for large uploads
    client_max_body_size 1g; # Adjust as needed

    location / {
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeouts for long operations
        proxy_connect_timeout       300; # 5 minutes
        proxy_send_timeout          600; # 10 minutes
        proxy_read_timeout          600; # 10 minutes
        send_timeout                600; # 10 minutes

        # Forward requests to the Ephemera container
        proxy_pass http://127.0.0.1:8080; # Assuming Ephemera runs on port 8080

        # Optional: Better error handling
        proxy_intercept_errors on; 
        # Add custom error pages if desired
    }
}
```

## 💻 Local Development Setup

Follow these steps to run Ephemera locally for development or testing.

**Prerequisites:**

*   [Rust](https://www.rust-lang.org/tools/install) (latest stable recommended)
*   [Node.js](https://nodejs.org/) (LTS version recommended) and npm (or pnpm/yarn)
*   [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
*   (Optional but Recommended for Image Previews) [libvips](https://www.libvips.org/install.html) development libraries (`libvips-dev` on Debian/Ubuntu).

**Steps:**

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/tonitrnel/ephemera.git
    cd ephemera
    ```

2.  **Build WebAssembly Modules:**
    ```bash
    # Build SHA256 Wasm module (outputs to web project)
    cd wasm/sha256
    wasm-pack build --target web --out-dir ../../web/src/wasm/sha256

    # Build Tar Wasm module (outputs to web project)
    cd ../tar
    wasm-pack build --target web --out-dir ../../web/src/wasm/tar
    cd ../..
    # Back to project root
    ```

3.  **Setup & Run Backend Server:**
    ```bash
    cd server
    # Copy example config if it doesn't exist
    # cp ../config/ephemera.conf.example ./config.toml
    # Edit ./config.toml if needed
    cargo build
    # For production build: cargo build --release
    cargo run
    # Server starts (default: http://127.0.0.1:8080)
    # Keep this terminal running or run in background
    cd ..
    # Back to project root
    ```

4.  **Setup & Run Frontend Dev Server:**
    ```bash
    cd web
    npm install # Or pnpm install / yarn install
    npm run dev
    # Frontend dev server starts (default: http://localhost:5173 or similar)
    ```

5.  **Access in Browser:** Open the URL provided by the frontend dev server (e.g., `http://localhost:5173`).

## 🛠️ Technology Stack

*   **Backend:** [Rust](https://www.rust-lang.org/), [Axum](https://github.com/tokio-rs/axum), [Tokio](https://tokio.rs/), [Serde](https://serde.rs/), [Toml](https://crates.io/crates/toml), [Libvips](https://github.com/libvips/libvips) (optional for image processing)
*   **Frontend:** [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev), [Shadcn UI](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
*   **WebAssembly (Wasm):** [Rust](https://www.rust-lang.org/) compiled with [`wasm-pack`](https://rustwasm.github.io/wasm-pack) for client-side hashing (SHA-256) and TAR packing.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit Pull Requests or open Issues.

1.  Fork the repository
2.  Create your feature branch: `git checkout -b feature/YourAmazingFeature`
3.  Commit your changes: `git commit -m 'feat: Add some AmazingFeature'`
4.  Push to the branch: `git push origin feature/YourAmazingFeature`
5.  Open a Pull Request

We appreciate contributions that:
*   Fix bugs
*   Improve documentation
*   Add new features (consider opening an issue first to discuss)
*   Enhance performance or code quality

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.