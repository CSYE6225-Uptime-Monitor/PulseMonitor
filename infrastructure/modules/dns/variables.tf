# Inputs for the dns module.

variable "project_name" {
  description = "Project name used for tagging and resource naming prefixes."
  type        = string
}

variable "environment" {
  description = "Deployment environment (dev, staging, or prod)."
  type        = string
}

variable "aws_region" {
  description = "AWS region SES sends from - used to build the region-specific feedback-smtp MX endpoint for the custom MAIL FROM domain. Must match the region module.monitoring's SES identity lives in."
  type        = string
}

variable "domain_name" {
  description = "Root domain to host in Route 53 and cover with the ACM certificate (apex + www)."
  type        = string

  validation {
    condition     = length(var.domain_name) > 0 && !endswith(var.domain_name, ".")
    error_message = "domain_name must be non-empty and must not end with a trailing dot - a trailing dot silently produces doubled-dot record names."
  }
}

variable "alb_dns_name" {
  description = "DNS name of the ALB (module.compute.alb_dns_name) - the alias target for the apex and www records."
  type        = string
}

variable "alb_zone_id" {
  description = "Route 53 hosted zone ID of the ALB (module.compute.alb_zone_id), NOT the zone this module creates - required for the alias records."
  type        = string
}

variable "alb_arn" {
  description = "ARN of the ALB (module.compute.alb_arn) - the WAF association target."
  type        = string
}

variable "enable_dns" {
  description = "Whether to create the hosted zone, the DNS-validated certificate, its validation records, and the apex/www alias records. Non-blocking: does NOT wait for the certificate to validate. See enable_https."
  type        = bool
  default     = false
}

# Separate from enable_dns: aws_acm_certificate_validation BLOCKS until the
# validation CNAME resolves publicly. The domain is registered at an external
# registrar, so nameserver delegation to this module's hosted zone is a
# manual step - if validation ran before that step, the resource would poll
# for its full timeout on every apply and hold the deploy pipeline's
# concurrency group. enable_dns must be able to create the zone and the
# pending certificate without ever instantiating the validation resource.
variable "enable_https" {
  description = "Whether to wait for DNS certificate validation and expose the validated certificate_arn. Requires enable_dns and requires the domain's nameservers to already be delegated to this module's hosted zone."
  type        = bool
  default     = false
}

variable "enable_waf" {
  description = "Whether to create a WAFv2 web ACL (managed rule groups + a per-IP rate limit) and associate it with the ALB."
  type        = bool
  default     = false
}

# Derived in the root module from static values
# (var.enable_notifications && var.notification_sender_identity_type ==
# "domain"), never from the token list itself - module.monitoring's
# ses_dkim_tokens output is a computed list of unknown length at plan on the
# apply that first creates the SES identity, and both `for_each =
# toset(tokens)` and `count = length(tokens) > 0 ? 3 : 0` would be plan
# errors ("value depends on resource attributes that cannot be determined
# until apply").
variable "enable_ses_dkim" {
  description = "Whether to publish the 3 SES Easy DKIM CNAME records for notification_sender_domain. True only when enable_notifications is on and notification_sender_identity_type is \"domain\"."
  type        = bool
  default     = false
}

variable "ses_dkim_tokens" {
  description = "The 3 DKIM tokens from module.monitoring.ses_dkim_tokens. Only read when enable_ses_dkim is true - null otherwise."
  type        = list(string)
  default     = []
}

variable "ses_mail_from_subdomain" {
  description = "Subdomain (under domain_name) used as the SES custom MAIL FROM domain, e.g. \"mail\" -> mail.pulsemonitor.online. Must differ from domain_name and must not be used to receive other mail."
  type        = string
  default     = "mail"
}

variable "dmarc_report_email" {
  description = "Mailbox for DMARC aggregate reports (rua=). Must be a mailbox this project controls - a cross-domain address requires a _report._dmarc authorization record in THAT domain's zone, which this module cannot create, and is silently ignored by reporters otherwise."
  type        = string
  default     = ""
}
