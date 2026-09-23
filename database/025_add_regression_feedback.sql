SET NAMES utf8mb4;

ALTER TABLE analysis_task
  ADD COLUMN regression_feedback JSON NULL
    COMMENT '用户对回归目标的确认或排除反馈'
    AFTER regression_plan;
