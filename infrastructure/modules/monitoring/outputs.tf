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

# output "alerts_topic_arn" - added in Sprint 4 alongside alerts.tf

output "site_events_bus_name" {
  description = "Name of the custom EventBridge bus the pinger publishes SiteStatusChanged events to. Null when enable_notifications is false."
  value       = one(aws_cloudwatch_event_bus.site_events[*].name)
}

output "notifier_function_name" {
  description = "Name of the notifier Lambda function. Null when enable_notifications is false."
  value       = one(aws_lambda_function.notifier[*].function_name)
}

output "notifier_dlq_url" {
  description = "URL of the notifier's dead-letter queue. Null when enable_notifications is false."
  value       = one(aws_sqs_queue.notifier_dlq[*].url)
}

output "notification_sender_identity" {
  description = "The SES identity that must be verified before any notification can send - the sender email in \"email\" mode, the domain in \"domain\" mode. Null when enable_notifications is false."
  value       = var.enable_notifications ? local.sender_identity : null
}

# Only .tokens, not the whole dkim_signing_attributes object: that object
# also carries domain_signing_private_key, which is a sensitive attribute -
# exporting the parent makes Terraform refuse the output entirely ("Output
# refers to sensitive values") the moment the identity exists in state. The
# tokens are the public half and the only part you actually publish as DNS.
output "ses_dkim_tokens" {
  description = "The 3 DKIM CNAME token values to publish at the domain registrar (as <token>._domainkey.<domain> CNAME <token>.dkim.amazonses.com). Null unless notification_sender_identity_type is \"domain\" - an email-address identity is verified by click-through, not DNS."
  value       = var.notification_sender_identity_type == "domain" ? try(aws_sesv2_email_identity.sender[0].dkim_signing_attributes[0].tokens, null) : null
}
