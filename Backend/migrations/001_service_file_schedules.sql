-- =============================================================================
-- Leadset: per-service file generation schedules (max 5 slots per service)
-- Run once against your MySQL database before deploying the app update.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. service_file_schedules
--    Each row = one daily slot: generate file at X, process at Y, with Z records.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_file_schedules (
  id                  INT               NOT NULL AUTO_INCREMENT,
  service_id          INT               NOT NULL,
  generate_time       TIME              NOT NULL COMMENT 'Daily wall-clock time to create the file',
  process_start_time  TIME              NOT NULL COMMENT 'Daily wall-clock time when processing may start',
  batch_size          INT UNSIGNED      NOT NULL COMMENT 'Unique MSISDN records per generated file',
  label               VARCHAR(100)      NULL     COMMENT 'Optional display label, e.g. Morning run',
  active              TINYINT(1)        NOT NULL DEFAULT 1,
  sort_order          TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_service_generate_time (service_id, generate_time),
  KEY idx_schedules_generate_active (generate_time, active),
  KEY idx_schedules_service (service_id),

  CONSTRAINT fk_schedules_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 2. service_generation_log
--    Prevents generating the same schedule slot twice on the same calendar day.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_generation_log (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id      INT             NOT NULL,
  service_id       INT             NOT NULL,
  generation_date  DATE            NOT NULL,
  file_entity_id   BIGINT          NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_schedule_generation_date (schedule_id, generation_date),
  KEY idx_generation_log_date (generation_date),

  CONSTRAINT fk_genlog_schedule
    FOREIGN KEY (schedule_id) REFERENCES service_file_schedules (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_genlog_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 3. service_msisdn_cursor
--    Per-service pointer into msisdn_list (last assigned id).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_msisdn_cursor (
  service_id      INT NOT NULL,
  last_msisdn_id  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (service_id),

  CONSTRAINT fk_cursor_service
    FOREIGN KEY (service_id) REFERENCES services (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- -----------------------------------------------------------------------------
-- 4. file_entity.schedule_id (optional link back to the slot that created the file)
--    Run once; ignore "Duplicate column name" if schedule_id already exists.
-- -----------------------------------------------------------------------------
ALTER TABLE file_entity
  ADD COLUMN schedule_id INT NULL AFTER service;

ALTER TABLE file_entity
  ADD KEY idx_file_entity_schedule (schedule_id);

-- -----------------------------------------------------------------------------
-- 5. Migrate existing services.schedule_time + batch_size → first schedule row
--    generate_time defaults to 1 hour before process_start_time (same day).
--    Skip services that already have schedules (idempotent re-run).
-- -----------------------------------------------------------------------------
INSERT INTO service_file_schedules (
  service_id,
  generate_time,
  process_start_time,
  batch_size,
  label,
  sort_order
)
SELECT
  s.id,
  TIME(
    DATE_SUB(
      CONCAT(CURDATE(), ' ', COALESCE(s.schedule_time, '22:00:00')),
      INTERVAL 1 HOUR
    )
  ) AS generate_time,
  COALESCE(s.schedule_time, '22:00:00') AS process_start_time,
  GREATEST(COALESCE(s.batch_size, 100000), 1) AS batch_size,
  'Migrated default' AS label,
  0 AS sort_order
FROM services s
WHERE s.active = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM service_file_schedules sfs WHERE sfs.service_id = s.id
  );

-- -----------------------------------------------------------------------------
-- 6. Seed per-service MSISDN cursors from existing AUTO file_entity rows
-- -----------------------------------------------------------------------------
INSERT INTO service_msisdn_cursor (service_id, last_msisdn_id)
SELECT
  s.id,
  COALESCE(
    (
      SELECT MAX(CAST(SUBSTRING_INDEX(fe.job_name, '-', -1) AS UNSIGNED))
      FROM file_entity fe
      WHERE fe.service COLLATE utf8mb4_0900_ai_ci = s.name
        AND fe.job_name LIKE 'AUTO-%'
    ),
    0
  ) AS last_msisdn_id
FROM services s
WHERE s.active = TRUE
ON DUPLICATE KEY UPDATE
  last_msisdn_id = GREATEST(
    service_msisdn_cursor.last_msisdn_id,
    VALUES(last_msisdn_id)
  );

-- -----------------------------------------------------------------------------
-- Notes (optional — do NOT drop legacy columns until you verify migration):
--   services.schedule_time and services.batch_size can remain for rollback.
--   New code reads/writes service_file_schedules only.
-- -----------------------------------------------------------------------------
