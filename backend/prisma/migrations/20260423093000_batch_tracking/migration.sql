ALTER TABLE `stock_in_items`
  ADD COLUMN `available_qty_balance` DECIMAL(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN `borrowed_qty_balance` DECIMAL(12, 3) NOT NULL DEFAULT 0,
  ADD COLUMN `pending_qty_balance` DECIMAL(12, 3) NOT NULL DEFAULT 0;

CREATE TABLE `stock_out_item_batch_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stock_out_item_id` BIGINT UNSIGNED NOT NULL,
  `stock_in_item_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(12, 3) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `soi_batch_alloc_uq`(`stock_out_item_id`, `stock_in_item_id`),
  INDEX `soi_batch_stock_in_idx`(`stock_in_item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `recovery_batch_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recovery_record_id` BIGINT UNSIGNED NOT NULL,
  `stock_in_item_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(12, 3) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `recovery_batch_alloc_uq`(`recovery_record_id`, `stock_in_item_id`),
  INDEX `recovery_batch_stock_in_idx`(`stock_in_item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `loss_batch_allocations` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `loss_record_id` BIGINT UNSIGNED NOT NULL,
  `stock_in_item_id` BIGINT UNSIGNED NOT NULL,
  `qty` DECIMAL(12, 3) NOT NULL,
  `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  UNIQUE INDEX `loss_batch_alloc_uq`(`loss_record_id`, `stock_in_item_id`),
  INDEX `loss_batch_stock_in_idx`(`stock_in_item_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `stock_out_item_batch_allocations`
  ADD CONSTRAINT `stock_out_item_batch_allocations_stock_out_item_id_fkey`
    FOREIGN KEY (`stock_out_item_id`) REFERENCES `stock_out_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `stock_out_item_batch_allocations_stock_in_item_id_fkey`
    FOREIGN KEY (`stock_in_item_id`) REFERENCES `stock_in_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `recovery_batch_allocations`
  ADD CONSTRAINT `recovery_batch_allocations_recovery_record_id_fkey`
    FOREIGN KEY (`recovery_record_id`) REFERENCES `recovery_records`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `recovery_batch_allocations_stock_in_item_id_fkey`
    FOREIGN KEY (`stock_in_item_id`) REFERENCES `stock_in_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `loss_batch_allocations`
  ADD CONSTRAINT `loss_batch_allocations_loss_record_id_fkey`
    FOREIGN KEY (`loss_record_id`) REFERENCES `loss_records`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `loss_batch_allocations_stock_in_item_id_fkey`
    FOREIGN KEY (`stock_in_item_id`) REFERENCES `stock_in_items`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
