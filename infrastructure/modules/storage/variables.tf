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

variable "export_prefix" {
  description = "Key prefix under which data exports are written in the user-data bucket. Must match compute module's export_prefix (the app's write/read prefix) - not wired through a shared root variable since defaults already agree and there is a single writer/reader."
  type        = string
  default     = "exports/"
}

variable "export_retention_days" {
  description = "Number of days a data export is retained in the user-data bucket before expiring."
  type        = number
  default     = 7

  validation {
    condition     = var.export_retention_days > 0
    error_message = "export_retention_days must be greater than 0."
  }
}

variable "audit_prefix" {
  description = "Key prefix under which audit events are written in the audit-logs bucket. Must match compute module's audit_prefix, for the same reason as export_prefix above."
  type        = string
  default     = "audit/"
}

variable "audit_retention_days" {
  description = "Number of days an audit event is retained in the audit-logs bucket before expiring. This is an activity-feed retention window, not a compliance guarantee - see backend/src/middleware/audit.js."
  type        = number
  default     = 365

  validation {
    condition     = var.audit_retention_days > 0
    error_message = "audit_retention_days must be greater than 0."
  }
}
