-- 保存变更影响分析的风险结论、影响模块和回归建议
USE impact_flow;

ALTER TABLE analysis_task
  ADD COLUMN risk_level VARCHAR(20) NULL COMMENT '风险等级：LOW/MEDIUM/HIGH/CRITICAL' AFTER error_message,
  ADD COLUMN risk_summary VARCHAR(1000) NULL COMMENT '风险摘要' AFTER risk_level,
  ADD COLUMN impacted_modules JSON NULL COMMENT '受影响模块' AFTER risk_summary,
  ADD COLUMN regression_suggestions JSON NULL COMMENT '回归建议' AFTER impacted_modules;
