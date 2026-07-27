# Outputs for the storage module.

output "users_table_name" {
  description = "Name of the DynamoDB users table."
  value       = aws_dynamodb_table.users.name
}

output "users_table_arn" {
  description = "ARN of the DynamoDB users table."
  value       = aws_dynamodb_table.users.arn
}

# output "user_data_bucket"          { value = aws_s3_bucket.user_data.id }
# output "audit_logs_bucket"         { value = aws_s3_bucket.audit_logs.id }
# output "monitoring_history_bucket" { value = aws_s3_bucket.monitoring_history.id }
# output "sites_table_name"          { value = aws_dynamodb_table.sites.name }
