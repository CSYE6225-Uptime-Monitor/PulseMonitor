# Root module outputs.
# Placeholders for this init sprint — real outputs (VPC id, ALB DNS name, etc.)
# are added as each module is implemented in later sprints.

output "vpc_id" {
  description = "ID of the custom VPC."
  value       = module.network.vpc_id
}

output "users_table_name" {
  description = "Name of the DynamoDB users table."
  value       = module.storage.users_table_name
}
