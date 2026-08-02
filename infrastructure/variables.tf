# Input variables for the PulseMonitor root module.
# Defaults reflect the target architecture (us-east-1, 2 AZs, pulsemonitor.online).

variable "aws_region" {
  description = "AWS region to deploy PulseMonitor into."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for tagging and resource naming prefixes."
  type        = string
  default     = "pulsemonitor"
}

variable "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the custom VPC."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "availability_zones" {
  description = "Availability zones for the multi-AZ layout (expects at least 2)."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "Provide at least two availability zones for high availability."
  }
}

variable "domain_name" {
  description = "Root domain served via Route 53."
  type        = string
  default     = "pulsemonitor.online"
}

variable "tags" {
  description = "Additional tags merged into the provider default_tags."
  type        = map(string)
  default     = {}
}

variable "monitoring_history_retention_days" {
  description = "Number of days raw ping records are retained in the monitoring-history bucket before expiring."
  type        = number
  default     = 90
}

variable "bucket_force_destroy" {
  description = "Whether S3 buckets can be destroyed while they still contain objects. Only enable for dev/test environments."
  type        = bool
  default     = false
}

variable "ping_schedule" {
  description = "EventBridge schedule expression for invoking the pinger."
  type        = string
  default     = "rate(5 minutes)"
}

variable "enable_alerts" {
  description = "Whether to provision the SNS alerts topic and CloudWatch alarms (Sprint 4)."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address subscribed to the SNS alerts topic when enable_alerts is true."
  type        = string
  default     = ""
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
  description = "ACM certificate ARN for the HTTPS listener. Null until the DNS module provisions one."
  type        = string
  default     = null
}
