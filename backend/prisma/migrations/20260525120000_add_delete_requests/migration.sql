CREATE TABLE `delete_requests` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `target_type` VARCHAR(50) NOT NULL,
  `target_id` BIGINT UNSIGNED NOT NULL,
  `target_desc` JSON NOT NULL,
  `requested_by` BIGINT UNSIGNED NOT NULL,
  `request_time` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `reviewed_by` BIGINT UNSIGNED NULL,
  `reviewed_at` DATETIME(0) NULL,
  `review_note` VARCHAR(500) NULL,
  PRIMARY KEY (`id`),
  INDEX `delete_requests_status_idx` (`status`),
  INDEX `delete_requests_requested_by_idx` (`requested_by`),
  INDEX `delete_requests_target_idx` (`target_type`, `target_id`),
  CONSTRAINT `delete_requests_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `delete_requests_reviewed_by_fkey` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
