CREATE TABLE IF NOT EXISTS marketing_campaign (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject VARCHAR(255) NOT NULL,
  html_content LONGTEXT NOT NULL,
  text_content LONGTEXT NULL,
  filter_json JSON NOT NULL,
  recipient_count INT NOT NULL DEFAULT 0,
  status ENUM('draft','sending','done','failed','partial') NOT NULL DEFAULT 'draft',
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME NULL,
  finished_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_marketing_campaign_created_at (created_at),
  KEY idx_marketing_campaign_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_campaign_recipient (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  user_name VARCHAR(128) NOT NULL,
  send_status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  provider_message_id VARCHAR(255) NULL,
  error_message TEXT NULL,
  sent_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_campaign_email (campaign_id, email),
  KEY idx_campaign_status (campaign_id, send_status),
  KEY idx_campaign_id (campaign_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
