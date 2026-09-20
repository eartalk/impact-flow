-- Select the request/response protocol used by each AI provider.
USE impact_flow;

ALTER TABLE ai_provider_config
  ADD COLUMN api_format VARCHAR(20) NOT NULL DEFAULT 'OPENAI' AFTER model;
