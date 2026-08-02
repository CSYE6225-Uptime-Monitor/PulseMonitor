# Outputs for the compute module.

output "alb_dns_name" {
  description = "DNS name of the ALB."
  value       = aws_lb.this.dns_name
}

output "alb_zone_id" {
  description = "Route 53 hosted zone ID of the ALB (for alias records)."
  value       = aws_lb.this.zone_id
}

output "alb_arn" {
  description = "ARN of the ALB."
  value       = aws_lb.this.arn
}

output "alb_arn_suffix" {
  description = "ARN suffix of the ALB, used by CloudWatch alarms."
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn" {
  description = "ARN of the app target group."
  value       = aws_lb_target_group.app.arn
}

output "asg_name" {
  description = "Name of the app Auto Scaling Group."
  value       = aws_autoscaling_group.app.name
}

output "launch_template_id" {
  description = "ID of the app launch template."
  value       = aws_launch_template.app.id
}

output "launch_template_latest_version" {
  description = "Latest version number of the app launch template."
  value       = aws_launch_template.app.latest_version
}

output "instance_role_arn" {
  description = "ARN of the EC2 instance IAM role."
  value       = aws_iam_role.instance.arn
}

output "instance_role_name" {
  description = "Name of the EC2 instance IAM role."
  value       = aws_iam_role.instance.name
}

output "app_url" {
  description = "HTTP URL of the ALB (until the DNS/ACM module is live)."
  value       = "http://${aws_lb.this.dns_name}"
}
