# Inputs for the monitoring module.

variable "project_name" {
  description = "Project name used for tagging and resource naming prefixes."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  type        = string
}

variable "sites_table_name" {
  description = "Name of the DynamoDB sites table the pinger scans and updates."
  type        = string
}

variable "sites_table_arn" {
  description = "ARN of the DynamoDB sites table the pinger scans and updates."
  type        = string
}

variable "monitoring_history_bucket" {
  description = "Name of the S3 bucket the pinger appends history records to."
  type        = string
}

variable "monitoring_history_bucket_arn" {
  description = "ARN of the S3 bucket the pinger appends history records to."
  type        = string
}

variable "history_prefix" {
  description = "Key prefix under which the pinger writes history records."
  type        = string
  default     = "sites"
}

variable "ping_schedule" {
  description = "EventBridge schedule expression for invoking the pinger."
  type        = string
  default     = "rate(5 minutes)"

  validation {
    condition     = can(regex("^(rate|cron)\\(", var.ping_schedule))
    error_message = "ping_schedule must be a rate(...) or cron(...) expression."
  }
}

variable "ping_enabled" {
  description = "Whether the EventBridge schedule rule is enabled."
  type        = bool
  default     = true
}

variable "lambda_timeout" {
  description = "Pinger Lambda timeout in seconds."
  type        = number
  default     = 120

  validation {
    condition     = var.lambda_timeout > 0 && var.lambda_timeout <= 900
    error_message = "lambda_timeout must be between 1 and 900 seconds."
  }
}

variable "lambda_memory_mb" {
  description = "Pinger Lambda memory allocation in MB."
  type        = number
  default     = 256

  validation {
    condition     = var.lambda_memory_mb >= 128 && var.lambda_memory_mb <= 10240
    error_message = "lambda_memory_mb must be between 128 and 10240."
  }
}

variable "ping_timeout_ms" {
  description = "Per-request HTTP timeout the pinger uses when checking a site, in milliseconds."
  type        = number
  default     = 10000

  validation {
    condition     = var.ping_timeout_ms < var.lambda_timeout * 1000
    error_message = "ping_timeout_ms must be less than lambda_timeout (in ms), or a single slow site can exhaust the whole invocation."
  }
}

variable "max_concurrency" {
  description = "Maximum number of sites the pinger checks concurrently."
  type        = number
  default     = 20

  validation {
    condition     = var.max_concurrency >= 1 && var.max_concurrency <= 100
    error_message = "max_concurrency must be between 1 and 100."
  }
}

variable "metric_namespace" {
  description = "CloudWatch metric namespace the pinger emits EMF metrics under."
  type        = string
  default     = "PulseMonitor"
}

variable "log_level" {
  description = "Pinger Lambda log verbosity."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["debug", "info", "warn", "error"], var.log_level)
    error_message = "log_level must be one of: debug, info, warn, error."
  }
}

variable "log_retention_days" {
  description = "CloudWatch log group retention for the pinger function, in days."
  type        = number
  default     = 14
}

# Declared now (unused) so the Sprint-4 SNS + alarms diff is additive-only.
variable "enable_alerts" {
  description = "Whether to provision the SNS alerts topic and CloudWatch alarms (Sprint 4)."
  type        = bool
  default     = false
}

variable "alert_email" {
  description = "Email address subscribed to the SNS alerts topic when enable_alerts is true."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_alerts || var.alert_email != ""
    error_message = "alert_email is required when enable_alerts is true."
  }
}
