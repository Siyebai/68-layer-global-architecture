-- 数据库初始化脚本 - 以 postgres 用户执行
-- 创建数据库和用户，并授予所有权限

\set ON_ERROR_STOP on

-- 创建数据库（如果不存在）
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'libai_trading') THEN
    PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE libai_trading');
  END IF;
END $$;

-- 确保用户存在（如果不存在）
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'libai') THEN
    CREATE USER libai WITH PASSWORD 'libai_password';
  END IF;
END $$;

-- 授予数据库权限
GRANT ALL PRIVILEGES ON DATABASE libai_trading TO libai;

-- 连接到目标数据库
\c libai_trading;

-- 授予 public schema 的所有权限
GRANT ALL ON SCHEMA public TO libai;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO libai;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO libai;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO libai;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO libai;

-- 创建扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 创建用户表
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  api_key VARCHAR(64) UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  subscription_tier VARCHAR(50) DEFAULT 'free',
  subscription_expires TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- 创建订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(50) NOT NULL,
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  payment_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 创建交易表
CREATE TABLE IF NOT EXISTS trades (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  symbol VARCHAR(20) NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  side VARCHAR(4) NOT NULL CHECK (side IN ('buy', 'sell')),
  type VARCHAR(10) NOT NULL DEFAULT 'market' CHECK (type IN ('market', 'limit')),
  price DECIMAL(20, 8) NOT NULL,
  quantity DECIMAL(20, 8) NOT NULL,
  fee DECIMAL(10, 2) DEFAULT 0,
  profit DECIMAL(10, 2),
  order_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'filled',
  created_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_trades_user_created ON trades(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- 插入示例数据 (可选)
-- INSERT INTO users (id, email, password_hash, full_name, api_key, subscription_tier)
-- VALUES (
--   uuid_generate_v4(),
--   'demo@libai-system.com',
--   '$2b$10$YourHashedPasswordHere',
--   'Demo User',
--   'demo_api_key_1234567890',
--   'pro'
-- );

\echo '✅ 数据库初始化完成'