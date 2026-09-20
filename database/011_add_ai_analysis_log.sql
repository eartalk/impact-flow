USE impact_flow;

CREATE TABLE IF NOT EXISTS ai_analysis_log (
  id CHAR(36) NOT NULL,
  analysis_task_id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  status VARCHAR(30) NOT NULL,
  model VARCHAR(150) NULL,
  error_message VARCHAR(2000) NULL,
  token_usage JSON NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY idx_ai_analysis_log_project_time (project_id, started_at),
  KEY idx_ai_analysis_log_task_time (analysis_task_id, started_at),
  CONSTRAINT fk_ai_analysis_log_task
    FOREIGN KEY (analysis_task_id) REFERENCES analysis_task (id),
  CONSTRAINT fk_ai_analysis_log_project
    FOREIGN KEY (project_id) REFERENCES project (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

INSERT INTO ai_analysis_log
  (id, analysis_task_id, project_id, status, model, error_message,
   token_usage, started_at, finished_at)
SELECT
  UUID(), a.id, a.project_id,
  JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.status')),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.model')), 'null'),
  NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.errorMessage')), 'null'),
  JSON_EXTRACT(a.ai_analysis, '$.tokenUsage'),
  COALESCE(
    STR_TO_DATE(
      REPLACE(REPLACE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.analyzedAt')), 'null'), 'T', ' '), 'Z', ''),
      '%Y-%m-%d %H:%i:%s.%f'
    ),
    a.finished_at,
    a.created_at
  ),
  COALESCE(
    STR_TO_DATE(
      REPLACE(REPLACE(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.analyzedAt')), 'null'), 'T', ' '), 'Z', ''),
      '%Y-%m-%d %H:%i:%s.%f'
    ),
    a.finished_at,
    a.created_at
  )
FROM analysis_task a
WHERE a.ai_analysis IS NOT NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(a.ai_analysis, '$.status')) <> 'RUNNING'
  AND NOT EXISTS (
    SELECT 1 FROM ai_analysis_log l WHERE l.analysis_task_id = a.id
  );
