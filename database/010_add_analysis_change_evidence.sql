USE impact_flow;

ALTER TABLE analysis_task
  ADD COLUMN change_evidence JSON NULL AFTER symbol_impacts;
