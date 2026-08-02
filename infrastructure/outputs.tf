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

output "sites_table_name" {
  description = "Name of the DynamoDB sites table."
  value       = module.storage.sites_table_name
}

output "user_data_bucket_name" {
  description = "Name of the user-data S3 bucket."
  value       = module.storage.user_data_bucket_name
}

output "audit_logs_bucket_name" {
  description = "Name of the audit-logs S3 bucket."
  value       = module.storage.audit_logs_bucket_name
}

output "monitoring_history_bucket_name" {
  description = "Name of the monitoring-history S3 bucket."
  value       = module.storage.monitoring_history_bucket_name
}
