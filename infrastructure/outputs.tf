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

output "pinger_function_name" {
  description = "Name of the pinger Lambda function."
  value       = module.monitoring.pinger_function_name
}

output "pinger_log_group_name" {
  description = "Name of the pinger Lambda's CloudWatch log group."
  value       = module.monitoring.pinger_log_group_name
}

output "alb_dns_name" {
  description = "DNS name of the ALB."
  value       = module.compute.alb_dns_name
}

output "alb_zone_id" {
  description = "Route 53 hosted zone ID of the ALB (for alias records)."
  value       = module.compute.alb_zone_id
}

output "asg_name" {
  description = "Name of the app Auto Scaling Group."
  value       = module.compute.asg_name
}

output "app_url" {
  description = "HTTP URL of the ALB (until the DNS/ACM module is live)."
  value       = module.compute.app_url
}
