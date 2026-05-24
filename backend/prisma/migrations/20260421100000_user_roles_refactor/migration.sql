ALTER TABLE `users`
MODIFY `role` ENUM(
  'admin',
  'keeper',
  'requester',
  'cnc_supervisor',
  'procurement_manager',
  'general_manager'
) NOT NULL DEFAULT 'general_manager';

UPDATE `users`
SET `role` = CASE
  WHEN `role` = 'admin' THEN 'procurement_manager'
  WHEN `role` = 'keeper' THEN 'procurement_manager'
  WHEN `role` = 'requester' THEN 'cnc_supervisor'
  ELSE `role`
END;

ALTER TABLE `users`
MODIFY `role` ENUM(
  'cnc_supervisor',
  'procurement_manager',
  'general_manager'
) NOT NULL DEFAULT 'general_manager';
