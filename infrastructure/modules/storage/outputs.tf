# Outputs for the storage module.

output "users_table_name" {
  description = "Name of the DynamoDB users table."
  value       = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  description = "ARN of the DynamoDB users table."
  value       = aws_dynamodb_table.users.arn
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
