-- Persist optional AI-assisted release analysis separately from deterministic rules.
USE impact_flow;

ALTER TABLE analysis_task
  ADD COLUMN ai_analysis JSON NULL COMMENT 'AI 补充分析结果' AFTER symbol_impacts;
