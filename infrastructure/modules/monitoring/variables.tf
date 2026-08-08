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

variable "users_table_name" {
  description = "Name of the DynamoDB users table, used by the notifier to resolve a site's owner email."
  type        = string
}

variable "users_table_arn" {
  description = "ARN of the DynamoDB users table (base table, not the index). The notifier's IAM grant is scoped to the users_user_id_index_arn instead."
  type        = string
}

variable "users_user_id_index_arn" {
  description = "ARN of the user_id-index GSI on the users table. The notifier's IAM policy is scoped to this index ARN, not the base table."
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

# -1, not 1: AWS rejects any reserved_concurrent_executions that would leave
# the account with fewer than 100 unreserved executions, and this account's
# "Concurrent executions" quota (L-B99A9384) is still at 10 rather than the
# default 1000 - so no reservation at all is legal today. -1 is the
# provider's "no reservation" sentinel. Raise the quota, then set this to 1,
# to restore the original intent: keeping a multi-site outage from firing a
# burst of concurrent notifier invocations against the SES sandbox's 1
# msg/sec ceiling (and keeping the pinger single-flight).
variable "lambda_reserved_concurrency" {
  description = "reserved_concurrent_executions for the pinger and notifier Lambdas. -1 means no reservation (the provider default). A positive value requires the account's unreserved concurrency to stay >= 100."
  type        = number
  default     = -1

  validation {
    condition     = var.lambda_reserved_concurrency == -1 || var.lambda_reserved_concurrency >= 1
    error_message = "lambda_reserved_concurrency must be -1 (unreserved) or a positive integer."
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

# Per-owner site down/recovery emails, distinct from enable_alerts above:
# enable_alerts is the Sprint-4 operator-facing SNS topic; this is the
# per-user SES notification path (custom EventBridge bus -> notifier Lambda).
variable "enable_notifications" {
  description = "Whether to provision the site down/recovery notification pipeline (custom EventBridge bus, notifier Lambda, SES)."
  type        = bool
  default     = false
}

# "email" is the zero-DNS path: one address, one click-through on the mail
# SES sends, and SES then requires the From address to BE that identity
# (hence local.sender_identity in notifications.tf, which cannot drift from
# notification_sender_email). "domain" is the Route-53-era path: 3 CNAMEs to
# publish, no click-through, and any From address at the domain is allowed.
variable "notification_sender_identity_type" {
  description = "Whether the SES sender identity is a single verified email address (\"email\") or a whole domain with Easy DKIM (\"domain\")."
  type        = string
  default     = "domain"

  validation {
    condition     = contains(["email", "domain"], var.notification_sender_identity_type)
    error_message = "notification_sender_identity_type must be either \"email\" or \"domain\"."
  }
}

variable "notification_sender_domain" {
  description = "SES domain identity used to send notification emails (Easy DKIM, verified via 3 CNAME records published at the registrar). Required when enable_notifications is true and notification_sender_identity_type is \"domain\"."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_notifications || var.notification_sender_identity_type != "domain" || var.notification_sender_domain != ""
    error_message = "notification_sender_domain is required when enable_notifications is true and notification_sender_identity_type is \"domain\"."
  }
}

variable "notification_sender_email" {
  description = "From address for notification emails. In \"domain\" mode this must be an address at notification_sender_domain; in \"email\" mode this IS the SES identity that gets verified."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_notifications || var.notification_sender_email != ""
    error_message = "notification_sender_email is required when enable_notifications is true."
  }
}

variable "notification_override_recipient" {
  description = "Sandbox escape hatch: when set, every notification is redirected to this one verified mailbox, with the intended recipient rendered into the subject/body. Forbidden in prod."
  type        = string
  default     = ""

  validation {
    condition     = var.environment != "prod" || var.notification_override_recipient == ""
    error_message = "notification_override_recipient must not be set in prod - it would silently redirect every real user's notification to one mailbox."
  }
}

variable "notification_verified_recipients" {
  description = "Extra SES email-identity recipients to verify for sandbox testing (each requires a manual click-through)."
  type        = list(string)
  default     = []

  # In email mode aws_sesv2_email_identity.sender already manages this exact
  # SES identity; listing it here too would make two Terraform resources
  # fight over one identity and fail the apply with AlreadyExistsException.
  validation {
    condition     = var.notification_sender_identity_type != "email" || !contains(var.notification_verified_recipients, var.notification_sender_email)
    error_message = "notification_sender_email must not also appear in notification_verified_recipients when notification_sender_identity_type is \"email\" - the sender identity already verifies that mailbox as a recipient."
  }
}

variable "notifier_log_retention_days" {
  description = "CloudWatch log group retention for the notifier function, in days."
  type        = number
  default     = 14
}
