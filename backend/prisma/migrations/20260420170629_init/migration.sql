-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `real_name` VARCHAR(50) NOT NULL,
    `role` ENUM('admin', 'keeper', 'requester') NOT NULL DEFAULT 'requester',
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_role_idx`(`role`),
    INDEX `users_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `parent_id` BIGINT UNSIGNED NULL,
    `level` INTEGER NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `categories_level_status_idx`(`level`, `status`),
    INDEX `categories_sort_order_idx`(`sort_order`),
    UNIQUE INDEX `categories_parent_id_name_key`(`parent_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `suppliers` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `contact_person` VARCHAR(50) NULL,
    `phone` VARCHAR(50) NULL,
    `channel` VARCHAR(50) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `suppliers_name_key`(`name`),
    INDEX `suppliers_channel_idx`(`channel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warehouses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_code` VARCHAR(50) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `specification` VARCHAR(200) NULL,
    `brand` VARCHAR(100) NULL,
    `category_id` BIGINT UNSIGNED NOT NULL,
    `unit` VARCHAR(20) NOT NULL,
    `tracking_mode` ENUM('closed_loop', 'consumable') NOT NULL DEFAULT 'closed_loop',
    `safe_stock` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `default_supplier_id` BIGINT UNSIGNED NULL,
    `default_price` DECIMAL(12, 2) NULL,
    `status` TINYINT NOT NULL DEFAULT 1,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `items_item_code_key`(`item_code`),
    INDEX `items_category_id_status_idx`(`category_id`, `status`),
    INDEX `items_name_idx`(`name`),
    INDEX `items_specification_idx`(`specification`),
    INDEX `items_brand_idx`(`brand`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `available_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `borrowed_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `pending_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `inventory_warehouse_id_idx`(`warehouse_id`),
    UNIQUE INDEX `inventory_item_id_warehouse_id_key`(`item_id`, `warehouse_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_in` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `in_no` VARCHAR(50) NOT NULL,
    `in_type` ENUM('purchase', 'opening_balance', 'returned', 'adjustment', 'other') NOT NULL,
    `status` ENUM('draft', 'confirmed', 'voided') NOT NULL DEFAULT 'confirmed',
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `supplier_id` BIGINT UNSIGNED NULL,
    `purchase_list_id` BIGINT UNSIGNED NULL,
    `in_time` DATETIME(0) NOT NULL,
    `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `stock_in_in_no_key`(`in_no`),
    INDEX `stock_in_warehouse_id_in_time_idx`(`warehouse_id`, `in_time`),
    INDEX `stock_in_operator_id_idx`(`operator_id`),
    INDEX `stock_in_supplier_id_idx`(`supplier_id`),
    INDEX `stock_in_purchase_list_id_idx`(`purchase_list_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_in_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `stock_in_id` BIGINT UNSIGNED NOT NULL,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `supplier_id` BIGINT UNSIGNED NULL,
    `purchase_list_item_id` BIGINT UNSIGNED NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total_price` DECIMAL(14, 2) NOT NULL DEFAULT 0,
    `purchase_channel` VARCHAR(100) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `stock_in_items_stock_in_id_idx`(`stock_in_id`),
    INDEX `stock_in_items_item_id_idx`(`item_id`),
    INDEX `stock_in_items_supplier_id_idx`(`supplier_id`),
    INDEX `stock_in_items_purchase_list_item_id_idx`(`purchase_list_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_out` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `out_no` VARCHAR(50) NOT NULL,
    `status` ENUM('draft', 'confirmed', 'voided') NOT NULL DEFAULT 'confirmed',
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `receiver_id` BIGINT UNSIGNED NULL,
    `receiver_name` VARCHAR(50) NOT NULL,
    `department` VARCHAR(50) NULL,
    `purpose` VARCHAR(200) NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `out_time` DATETIME(0) NOT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `stock_out_out_no_key`(`out_no`),
    INDEX `stock_out_warehouse_id_out_time_idx`(`warehouse_id`, `out_time`),
    INDEX `stock_out_receiver_id_idx`(`receiver_id`),
    INDEX `stock_out_operator_id_idx`(`operator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_out_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `stock_out_id` BIGINT UNSIGNED NOT NULL,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `stock_out_items_stock_out_id_idx`(`stock_out_id`),
    INDEX `stock_out_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `recovery_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `related_stock_out_item_id` BIGINT UNSIGNED NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `returned_by` VARCHAR(50) NOT NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `recovery_time` DATETIME(0) NOT NULL,
    `recovery_status` ENUM('reusable', 'roughing_reusable', 'pending_inspection', 'repairable', 'scrapped') NOT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `recovery_records_item_id_recovery_time_idx`(`item_id`, `recovery_time`),
    INDEX `recovery_records_warehouse_id_idx`(`warehouse_id`),
    INDEX `recovery_records_related_stock_out_item_id_idx`(`related_stock_out_item_id`),
    INDEX `recovery_records_operator_id_idx`(`operator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `loss_records` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `qty` DECIMAL(12, 3) NOT NULL,
    `loss_type` ENUM('normal_wear', 'broken', 'scrapped', 'lost', 'other') NOT NULL,
    `source_bucket` ENUM('available', 'borrowed', 'pending') NOT NULL,
    `related_stock_out_item_id` BIGINT UNSIGNED NULL,
    `related_recovery_id` BIGINT UNSIGNED NULL,
    `responsible_person` VARCHAR(50) NULL,
    `operator_id` BIGINT UNSIGNED NOT NULL,
    `record_time` DATETIME(0) NOT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `loss_records_item_id_record_time_idx`(`item_id`, `record_time`),
    INDEX `loss_records_warehouse_id_idx`(`warehouse_id`),
    INDEX `loss_records_related_stock_out_item_id_idx`(`related_stock_out_item_id`),
    INDEX `loss_records_related_recovery_id_idx`(`related_recovery_id`),
    INDEX `loss_records_operator_id_idx`(`operator_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_requests` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `request_no` VARCHAR(50) NOT NULL,
    `requester_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('pending', 'merged', 'purchased', 'cancelled') NOT NULL DEFAULT 'pending',
    `priority` ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium',
    `request_time` DATETIME(0) NOT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `purchase_requests_request_no_key`(`request_no`),
    INDEX `purchase_requests_requester_id_request_time_idx`(`requester_id`, `request_time`),
    INDEX `purchase_requests_status_priority_idx`(`status`, `priority`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_request_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `purchase_request_id` BIGINT UNSIGNED NOT NULL,
    `item_id` BIGINT UNSIGNED NULL,
    `requested_name` VARCHAR(100) NOT NULL,
    `requested_specification` VARCHAR(200) NULL,
    `requested_brand` VARCHAR(100) NULL,
    `requested_unit` VARCHAR(20) NULL,
    `requested_qty` DECIMAL(12, 3) NOT NULL,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `purchase_request_items_purchase_request_id_idx`(`purchase_request_id`),
    INDEX `purchase_request_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_lists` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `list_no` VARCHAR(50) NOT NULL,
    `status` ENUM('pending', 'purchasing', 'arrived', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    `created_by` BIGINT UNSIGNED NOT NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `purchase_lists_list_no_key`(`list_no`),
    INDEX `purchase_lists_created_by_idx`(`created_by`),
    INDEX `purchase_lists_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_list_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `purchase_list_id` BIGINT UNSIGNED NOT NULL,
    `item_id` BIGINT UNSIGNED NULL,
    `item_name` VARCHAR(100) NOT NULL,
    `specification` VARCHAR(200) NULL,
    `brand` VARCHAR(100) NULL,
    `unit` VARCHAR(20) NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `reference_price` DECIMAL(12, 2) NULL,
    `reference_supplier_id` BIGINT UNSIGNED NULL,
    `status` ENUM('pending', 'ordered', 'arrived', 'stocked_in', 'cancelled') NOT NULL DEFAULT 'pending',
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    INDEX `purchase_list_items_purchase_list_id_idx`(`purchase_list_id`),
    INDEX `purchase_list_items_item_id_idx`(`item_id`),
    INDEX `purchase_list_items_reference_supplier_id_idx`(`reference_supplier_id`),
    INDEX `purchase_list_items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_list_request_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `purchase_list_item_id` BIGINT UNSIGNED NOT NULL,
    `purchase_request_item_id` BIGINT UNSIGNED NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `purchase_list_request_items_purchase_request_item_id_idx`(`purchase_request_item_id`),
    UNIQUE INDEX `purchase_list_request_items_purchase_list_item_id_purchase_r_key`(`purchase_list_item_id`, `purchase_request_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_counts` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `count_no` VARCHAR(50) NOT NULL,
    `warehouse_id` BIGINT UNSIGNED NOT NULL DEFAULT 1,
    `count_year` INTEGER NULL,
    `status` ENUM('draft', 'confirmed', 'voided') NOT NULL DEFAULT 'draft',
    `created_by_id` BIGINT UNSIGNED NOT NULL,
    `approved_by_id` BIGINT UNSIGNED NULL,
    `count_time` DATETIME(0) NOT NULL,
    `approved_at` DATETIME(0) NULL,
    `remark` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NOT NULL,

    UNIQUE INDEX `stock_counts_count_no_key`(`count_no`),
    INDEX `stock_counts_warehouse_id_count_time_idx`(`warehouse_id`, `count_time`),
    INDEX `stock_counts_count_year_idx`(`count_year`),
    INDEX `stock_counts_status_idx`(`status`),
    INDEX `stock_counts_created_by_id_idx`(`created_by_id`),
    INDEX `stock_counts_approved_by_id_idx`(`approved_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stock_count_items` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `stock_count_id` BIGINT UNSIGNED NOT NULL,
    `item_id` BIGINT UNSIGNED NOT NULL,
    `system_available_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `system_borrowed_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `system_pending_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `actual_available_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `actual_borrowed_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `actual_pending_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `available_diff_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `borrowed_diff_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `pending_diff_qty` DECIMAL(12, 3) NOT NULL DEFAULT 0,
    `explanation` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `stock_count_items_item_id_idx`(`item_id`),
    UNIQUE INDEX `stock_count_items_stock_count_id_item_id_key`(`stock_count_id`, `item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NULL,
    `module` VARCHAR(50) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `target_table` VARCHAR(50) NULL,
    `target_id` BIGINT UNSIGNED NULL,
    `detail` JSON NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(255) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `operation_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `operation_logs_module_action_idx`(`module`, `action`),
    INDEX `operation_logs_target_table_target_id_idx`(`target_table`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `items` ADD CONSTRAINT `items_default_supplier_id_fkey` FOREIGN KEY (`default_supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in` ADD CONSTRAINT `stock_in_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in` ADD CONSTRAINT `stock_in_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in` ADD CONSTRAINT `stock_in_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in` ADD CONSTRAINT `stock_in_purchase_list_id_fkey` FOREIGN KEY (`purchase_list_id`) REFERENCES `purchase_lists`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in_items` ADD CONSTRAINT `stock_in_items_stock_in_id_fkey` FOREIGN KEY (`stock_in_id`) REFERENCES `stock_in`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in_items` ADD CONSTRAINT `stock_in_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in_items` ADD CONSTRAINT `stock_in_items_supplier_id_fkey` FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_in_items` ADD CONSTRAINT `stock_in_items_purchase_list_item_id_fkey` FOREIGN KEY (`purchase_list_item_id`) REFERENCES `purchase_list_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_out` ADD CONSTRAINT `stock_out_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_out` ADD CONSTRAINT `stock_out_receiver_id_fkey` FOREIGN KEY (`receiver_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_out` ADD CONSTRAINT `stock_out_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_out_items` ADD CONSTRAINT `stock_out_items_stock_out_id_fkey` FOREIGN KEY (`stock_out_id`) REFERENCES `stock_out`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_out_items` ADD CONSTRAINT `stock_out_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recovery_records` ADD CONSTRAINT `recovery_records_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recovery_records` ADD CONSTRAINT `recovery_records_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recovery_records` ADD CONSTRAINT `recovery_records_related_stock_out_item_id_fkey` FOREIGN KEY (`related_stock_out_item_id`) REFERENCES `stock_out_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `recovery_records` ADD CONSTRAINT `recovery_records_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loss_records` ADD CONSTRAINT `loss_records_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loss_records` ADD CONSTRAINT `loss_records_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loss_records` ADD CONSTRAINT `loss_records_related_stock_out_item_id_fkey` FOREIGN KEY (`related_stock_out_item_id`) REFERENCES `stock_out_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loss_records` ADD CONSTRAINT `loss_records_related_recovery_id_fkey` FOREIGN KEY (`related_recovery_id`) REFERENCES `recovery_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `loss_records` ADD CONSTRAINT `loss_records_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_requests` ADD CONSTRAINT `purchase_requests_requester_id_fkey` FOREIGN KEY (`requester_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_purchase_request_id_fkey` FOREIGN KEY (`purchase_request_id`) REFERENCES `purchase_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_request_items` ADD CONSTRAINT `purchase_request_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_lists` ADD CONSTRAINT `purchase_lists_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_list_items` ADD CONSTRAINT `purchase_list_items_purchase_list_id_fkey` FOREIGN KEY (`purchase_list_id`) REFERENCES `purchase_lists`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_list_items` ADD CONSTRAINT `purchase_list_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_list_items` ADD CONSTRAINT `purchase_list_items_reference_supplier_id_fkey` FOREIGN KEY (`reference_supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_list_request_items` ADD CONSTRAINT `purchase_list_request_items_purchase_list_item_id_fkey` FOREIGN KEY (`purchase_list_item_id`) REFERENCES `purchase_list_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_list_request_items` ADD CONSTRAINT `purchase_list_request_items_purchase_request_item_id_fkey` FOREIGN KEY (`purchase_request_item_id`) REFERENCES `purchase_request_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_created_by_id_fkey` FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_counts` ADD CONSTRAINT `stock_counts_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_count_items` ADD CONSTRAINT `stock_count_items_stock_count_id_fkey` FOREIGN KEY (`stock_count_id`) REFERENCES `stock_counts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_count_items` ADD CONSTRAINT `stock_count_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
