# Outputs for the monitoring module.

output "pinger_function_name" {
  description = "Name of the pinger Lambda function."
  value       = aws_lambda_function.pinger.function_name
}

output "pinger_function_arn" {
  description = "ARN of the pinger Lambda function."
  value       = aws_lambda_function.pinger.arn
}

output "pinger_role_arn" {
  description = "ARN of the pinger Lambda's execution role."
  value       = aws_iam_role.pinger.arn
}

output "pinger_log_group_name" {
  description = "Name of the pinger Lambda's CloudWatch log group."
  value       = aws_cloudwatch_log_group.pinger.name
}

output "ping_schedule_rule_arn" {
  description = "ARN of the EventBridge rule that schedules the pinger."
  value       = aws_cloudwatch_event_rule.ping_schedule.arn
}

# output "alerts_topic_arn" — added in Sprint 4 alongside alerts.tf
