-- Add migration script here

-- files
CREATE TABLE IF NOT EXISTS files
(
    id           TEXT PRIMARY KEY NOT NULL,                                        -- File UUIDv7
    user_id      TEXT,                                                             -- 所属用户
    device_id    TEXT,                                                             -- 上传设备
    name         TEXT             NOT NULL,                                        -- 文件名称
    hash         TEXT             NOT NULL,                                        -- 文件 Hash
    size         INTEGER          NOT NULL,                                        -- 大小
    mimetype     TEXT             NOT NULL,                                        -- 媒体类型
    extname      TEXT,                                                             -- 拓展名
    ipaddr       TEXT,                                                             -- IP 地址
    caption      TEXT,                                                             -- 说明
    tags         TEXT,                                                             -- 标签
    metadata     TEXT,                                                             -- 元数据，以 JSON 形式存储
    is_encrypted BOOLEAN          NOT NULL DEFAULT 0,                              -- 0表示未加密，1表示已加密
    is_pined     BOOLEAN          NOT NULL DEFAULT 0,                              -- 0 表示未固定，1 表示固定（防止被自动清理）
    created_at   INTEGER          NOT NULL DEFAULT (UNIXEPOCH(CURRENT_TIMESTAMP)), -- 创建时间
    updated_at   INTEGER          NOT NULL DEFAULT (UNIXEPOCH(CURRENT_TIMESTAMP)), -- 更新时间
    FOREIGN KEY (user_id) REFERENCES users (id),
    FOREIGN KEY (device_id) REFERENCES devices (id)
);

CREATE INDEX IF NOT EXISTS idx_files_hash ON files (hash);

CREATE TRIGGER IF NOT EXISTS tg_files_updated_at
    AFTER UPDATE
    ON files
    FOR EACH ROW
BEGIN
    UPDATE files
    set updated_at = UNIXEPOCH(CURRENT_TIMESTAMP)
    WHERE id = old.id;
END;

-- users
CREATE TABLE IF NOT EXISTS users
(
    id                    TEXT PRIMARY KEY NOT NULL,                                        -- 用户 ID，UUIDv4
    username              TEXT             NOT NULL,                                        -- 用户名
    auth_type             INTEGER          NOT NULL,                                        -- 鉴权方式，0 default(不可用), 1 srp, 2 webauthn
    srp_salt              TEXT,                                                             -- 如果鉴权方式为 1，SRP 盐
    srp_verifier          BLOB,                                                             -- 如果鉴权方式为 1，SRP 验证器
    webauthn_public_key   BLOB,                                                             -- 如果鉴权方式为  2，webauthn 公钥
    -- OTP START
    totp_secret           TEXT,                                                             -- BASE32加密存储
    otp_enabled           BOOLEAN                   DEFAULT 0,                              -- 启用 MFA
    recovery_codes        TEXT,                                                             -- 恢复码哈希，JSON 数组
    otp_last_used         INTEGER,                                                          -- 限制使用频率
    failed_attempts       INTEGER                   DEFAULT 0,                              -- 失败次数，超过一定次数锁定
    locked_until          INTEGER,                                                          -- 锁定持续至
    -- OTP END
    last_login            INTEGER,                                                          -- 上一次登录时间
    is_active             BOOLEAN          NOT NULL default 1,                              -- 是否活跃
    storage_quota         INTEGER          NOT NULL,                                        -- unit MB
    role                  INTEGER          NOT NULL DEFAULT 0,                              -- 用户角色，1 管理员 0 普通用户
    -- 加密相关
    encryption_public_key BLOB,                                                             -- 用于加密文件的用户公钥
    encrypted_master_key  BLOB,                                                             -- 用于解密用户私钥的主密钥
    master_key_salt       BLOB,                                                             -- 用于加/解密用户私钥的盐值
    master_key_nonce      BLOB,                                                             -- 加密主密钥时使用的 nonce
    encrypted_private_key BLOB,                                                             -- 用于解密文件的用户私钥密文（使用 Mater key 解密）
    private_key_nonce     BLOB,                                                             -- 加密用户私钥时使用的 nonce
    created_at            INTEGER          NOT NULL DEFAULT (UNIXEPOCH(CURRENT_TIMESTAMP)), -- 创建时间
    updated_at            INTEGER          NOT NULL DEFAULT (UNIXEPOCH(CURRENT_TIMESTAMP)), -- 更新时间
    -- 约束
    CHECK (
        auth_type == 1 AND srp_salt IS NOT NULL AND srp_verifier IS NOT NULL
        ),
    CHECK (
        auth_type == 2 AND webauthn_public_key IS NOT NULL
        ),
    CHECK (
        otp_enabled == 1 AND totp_secret IS NOT NULL
        ),
    CHECK (
        encrypted_master_key IS NOT NULL AND master_key_salt IS NOT NULL AND master_key_nonce IS NOT NULL
        ),
    CHECK (
        encrypted_private_key IS NOT NULL AND private_key_nonce IS NOT NULL AND encrypted_master_key IS NOT NULL
        )
);

CREATE TRIGGER IF NOT EXISTS tg_users_updated_at
    AFTER UPDATE
    ON users
    FOR EACH ROW
BEGIN
    UPDATE users
    set updated_at = UNIXEPOCH(CURRENT_TIMESTAMP)
    WHERE id = old.id;
END;

CREATE TABLE IF NOT EXISTS devices
(
    id               TEXT PRIMARY KEY NOT NULL,                                        -- 设备 ID
    fingerprint_hash TEXT             NOT NULL,                                        -- 设备指纹 HASH
    device_name      TEXT             NOT NULL,                                        -- 设备名称
    user_id          TEXT,                                                             -- 归属的用户
    created_at       INTEGER          NOT NULL DEFAULT (UNIXEPOCH(CURRENT_TIMESTAMP)), -- 创建时间
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE INDEX IF NOT EXISTS idx_devices_hash ON devices (fingerprint_hash);