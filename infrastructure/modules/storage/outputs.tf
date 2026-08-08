# Outputs for the storage module.

output "users_table_name" {
  description = "Name of the DynamoDB users table."
  value       = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  description = "ARN of the DynamoDB users table."
  value       = aws_dynamodb_table.users.arn
}

output "users_user_id_index_name" {
  description = "Name of the user_id-index GSI on the users table, used by the notifier to resolve a site's owner email from user_id."
  value       = "user_id-index"
}

output "users_user_id_index_arn" {
  description = "ARN of the user_id-index GSI, used to scope the notifier's IAM grant to the index rather than the base table."
  value       = "${aws_dynamodb_table.users.arn}/index/user_id-index"
}

output "sites_table_name" {
  description = "Name of the DynamoDB sites table."
  value       = aws_dynamodb_table.sites.name
}

output "sites_table_arn" {
  description = "ARN of the DynamoDB sites table."
  value       = aws_dynamodb_table.sites.arn
}

output "user_data_bucket_name" {
  description = "Name of the user-data S3 bucket."
  value       = aws_s3_bucket.user_data.id
}

output "user_data_bucket_arn" {
  description = "ARN of the user-data S3 bucket."
  value       = aws_s3_bucket.user_data.arn
}

output "audit_logs_bucket_name" {
  description = "Name of the audit-logs S3 bucket."
  value       = aws_s3_bucket.audit_logs.id
}

output "audit_logs_bucket_arn" {
  description = "ARN of the audit-logs S3 bucket."
  value       = aws_s3_bucket.audit_logs.arn
}

output "monitoring_history_bucket_name" {
  description = "Name of the monitoring-history S3 bucket."
  value       = aws_s3_bucket.monitoring_history.id
}

output "monitoring_history_bucket_arn" {
  description = "ARN of the monitoring-history S3 bucket."
  value       = aws_s3_bucket.monitoring_history.arn
}

output "monitoring_history_lifecycle_prefix" {
  description = "S3 key prefix used by the lifecycle expiry rule. Exposed so root-module tests can assert that history_prefix is wired correctly."
  value       = var.raw_ping_prefix
}
