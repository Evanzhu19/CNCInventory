ALTER TABLE `items`
MODIFY `tracking_mode` ENUM(
  'closed_loop',
  'consumable',
  'high_value_consumable',
  'repair_pending'
) NOT NULL DEFAULT 'closed_loop';
