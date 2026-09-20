-- Store multiple OpenAI-compatible API configurations with encrypted credentials.
USE impact_flow;

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  base_url VARCHAR(500) NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  api_key_hint VARCHAR(20) NOT NULL,
  model VARCHAR(150) NOT NULL,
  api_format VARCHAR(20) NOT NULL DEFAULT 'OPENAI',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  timeout_ms INT NOT NULL DEFAULT 30000,
  max_files INT NOT NULL DEFAULT 80,
  max_symbols INT NOT NULL DEFAULT 50,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_ai_provider_default (is_default, enabled)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
