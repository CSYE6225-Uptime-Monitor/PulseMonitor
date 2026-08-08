# Inputs for the compute module.

variable "project_name" {
  description = "Project name used for tagging and resource naming prefixes."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  type        = string
}

variable "aws_region" {
  description = "AWS region (used to fetch the SSM SecureString parameter in user-data)."
  type        = string
}

variable "vpc_id" {
  description = "ID of the VPC the ALB and instances live in."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnet IDs the ALB is placed in."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Private subnet IDs the ASG launches instances into."
  type        = list(string)
}

variable "alb_sg_id" {
  description = "Security group ID for the ALB (80/443 from the internet)."
  type        = string
}

variable "app_sg_id" {
  description = "Security group ID for app instances (app_port from the ALB SG only)."
  type        = string
}

variable "alb_target_port" {
  description = "Port on app instances the ALB forwards to (nginx, which proxies to the Express app)."
  type        = number
  default     = 80
}

variable "app_port" {
  description = "Port the Express app listens on behind nginx."
  type        = number
  default     = 8080
}

variable "instance_type" {
  description = "EC2 instance type for app instances."
  type        = string
  default     = "t3.micro"
}

variable "ami_id" {
  description = "AMI ID to launch. Defaults to the newest Packer-baked AMI tagged Application=pulsemonitor-backend."
  type        = string
  default     = null
}

variable "asg_min_size" {
  description = "Minimum number of app instances (one per AZ)."
  type        = number
  default     = 2

  validation {
    condition     = var.asg_min_size >= 2
    error_message = "asg_min_size must be at least 2 for multi-AZ availability."
  }
}

variable "asg_max_size" {
  description = "Maximum number of app instances."
  type        = number
  default     = 4
}

variable "asg_desired_capacity" {
  description = "Desired number of app instances."
  type        = number
  default     = 2
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the HTTPS listener. Null until the DNS module's certificate is validated."
  type        = string
  default     = null
}

# Separate from certificate_arn on purpose: count and dynamic{}'s for_each
# must be known at PLAN time, but certificate_arn is unknown on the very
# apply that first creates the certificate (aws_acm_certificate_validation's
# output isn't resolved yet) - gating the listeners on `certificate_arn ==
# null` would make that apply fail with "Invalid count argument". A plain
# bool, set by the root module only once the cert is already validated in
# state, sidesteps the whole class of failure.
variable "enable_https" {
  description = "Whether to create the HTTPS listener and redirect HTTP->HTTPS. Requires certificate_arn to be set."
  type        = bool
  default     = false
}

variable "ssl_policy" {
  description = "TLS security policy for the HTTPS listener (only used when certificate_arn is set)."
  type        = string
  default     = "ELBSecurityPolicy-TLS13-1-2-2021-06"
}

variable "node_env" {
  description = "NODE_ENV written into the app's environment file."
  type        = string
  default     = "production"
}

variable "cookie_secure" {
  description = "COOKIE_SECURE written into the app's environment file. Keep false until the HTTPS listener is live."
  type        = bool
  default     = false
}

variable "users_table_name" {
  description = "Name of the DynamoDB users table."
  type        = string
}

variable "users_table_arn" {
  description = "ARN of the DynamoDB users table."
  type        = string
}

variable "sites_table_name" {
  description = "Name of the DynamoDB sites table."
  type        = string
}

variable "sites_table_arn" {
  description = "ARN of the DynamoDB sites table."
  type        = string
}

variable "user_data_bucket_name" {
  description = "Name of the user-data S3 bucket."
  type        = string
}

variable "user_data_bucket_arn" {
  description = "ARN of the user-data S3 bucket."
  type        = string
}

variable "audit_logs_bucket_arn" {
  description = "ARN of the audit-logs S3 bucket."
  type        = string
}

variable "audit_logs_bucket_name" {
  description = "Name of the audit-logs S3 bucket."
  type        = string
}

variable "monitoring_history_bucket_name" {
  description = "Name of the monitoring-history S3 bucket."
  type        = string
}

variable "monitoring_history_bucket_arn" {
  description = "ARN of the monitoring-history S3 bucket."
  type        = string
}

variable "history_prefix" {
  description = "S3 key prefix history records are read from. Must match module.monitoring's history_prefix (the pinger's write prefix) - fed from the same root variable so the two can't drift."
  type        = string
  default     = "sites"
}

variable "audit_prefix" {
  description = "S3 key prefix audit events are written to and read from. Unlike history_prefix, the app is the only writer and reader, so this is compute-local rather than a root variable."
  type        = string
  default     = "audit"
}

variable "export_prefix" {
  description = "S3 key prefix data exports are written to and read from. Compute-local for the same reason as audit_prefix."
  type        = string
  default     = "exports"
}

variable "log_retention_days" {
  description = "CloudWatch log group retention for the app, in days."
  type        = number
  default     = 14
}

variable "enable_session_manager" {
  description = "Whether to attach AmazonSSMManagedInstanceCore so instances are reachable via SSM Session Manager instead of SSH."
  type        = bool
  default     = true
}

variable "detailed_monitoring" {
  description = "Whether to enable detailed (1-minute) EC2 monitoring."
  type        = bool
  default     = false
}
