-- Persist TypeScript AST symbol changes and reverse call-chain impacts.
USE impact_flow;

ALTER TABLE analysis_task
  ADD COLUMN symbol_summary VARCHAR(1000) NULL COMMENT 'AST Symbol 分析摘要' AFTER regression_suggestions,
  ADD COLUMN symbol_changes JSON NULL COMMENT '变更 Symbol 列表' AFTER symbol_summary,
  ADD COLUMN symbol_impacts JSON NULL COMMENT '反向调用链影响列表' AFTER symbol_changes;
