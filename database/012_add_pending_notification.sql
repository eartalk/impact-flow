CREATE TABLE IF NOT EXISTS pending_notification_config (
  id TINYINT UNSIGNED NOT NULL DEFAULT 1,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  webhook_encrypted TEXT NULL,
  webhook_hint VARCHAR(32) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

INSERT INTO pending_notification_config (id, enabled)
VALUES (1, 0)
ON DUPLICATE KEY UPDATE id = VALUES(id);

CREATE TABLE IF NOT EXISTS pending_notification_delivery (
  id CHAR(36) NOT NULL,
  project_id CHAR(36) NOT NULL,
  target_commit VARCHAR(64) NOT NULL,
  delivered_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_pending_notification_delivery (project_id, target_commit),
  KEY idx_pending_notification_delivery_time (delivered_at),
  CONSTRAINT fk_pending_notification_delivery_project
    FOREIGN KEY (project_id) REFERENCES project (id)
    ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
