# Inputs for the storage module.

variable "project_name" {
  description = "Project name used for tagging and resource naming prefixes."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  type        = string
}

variable "monitoring_history_retention_days" {
  description = "Number of days raw ping records are retained in the monitoring-history bucket before expiring."
  type        = number
  default     = 90

  validation {
    condition     = var.monitoring_history_retention_days > 0
    error_message = "monitoring_history_retention_days must be greater than 0."
  }
}

variable "raw_ping_prefix" {
  description = "Key prefix under which raw ping records are written in the monitoring-history bucket."
  type        = string
  default     = "sites/"
}

variable "bucket_force_destroy" {
  description = "Whether S3 buckets can be destroyed while they still contain objects. Only enable for dev/test environments."
  type        = bool
  default     = false
}

variable "bucket_name_suffix" {
  description = "Explicit suffix for globally-unique bucket names. Defaults to the AWS account ID when unset."
  type        = string
  default     = null
}
