ALTER TABLE `users`
MODIFY `role` ENUM(
  'admin',
  'cnc_supervisor',
  'procurement_manager',
  'general_manager'
) NOT NULL DEFAULT 'cnc_supervisor';
