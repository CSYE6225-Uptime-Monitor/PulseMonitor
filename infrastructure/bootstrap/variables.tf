# Bootstrap input variables.
# Bucket names are globally unique - override state_bucket_name before applying.

variable "aws_region" {
  description = "AWS region for the remote-state resources."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for tagging."
  type        = string
  default     = "pulsemonitor"
}

variable "state_bucket_name" {
  description = "Globally-unique S3 bucket name for Terraform state."
  type        = string
  default     = "pulsemonitor-tfstate"
}

variable "lock_table_name" {
  description = "DynamoDB table name for Terraform state locking."
  type        = string
  default     = "pulsemonitor-tf-locks"
}

# --- GitHub Actions CD -------------------------------------------------------

variable "enable_github_oidc" {
  description = "Whether to provision the GitHub Actions OIDC provider and deploy role used by .github/workflows/deploy.yml."
  type        = bool
  default     = true
}

variable "github_repository" {
  description = "owner/repo allowed to assume the deploy role."
  type        = string
  default     = "CSYE6225-Uptime-Monitor/PulseMonitor"

  validation {
    condition     = can(regex("^[^/]+/[^/]+$", var.github_repository))
    error_message = "github_repository must be in owner/repo form."
  }
}

# The trust policy - not the permission policy - is the real security boundary
# here: only a workflow running on this repo's main branch can mint
# credentials at all. Widen deliberately (e.g. add
# "repo:owner/repo:pull_request" if you later want plan-on-PR).
variable "github_allowed_subjects" {
  description = "OIDC `sub` claim patterns permitted to assume the deploy role."
  type        = list(string)
  default     = ["ref:refs/heads/main"]

  validation {
    condition     = length(var.github_allowed_subjects) > 0
    error_message = "github_allowed_subjects must not be empty - an empty list would trust nothing and the deploy workflow could never authenticate."
  }
}

# AdministratorAccess by default, and that is a deliberate, visible choice
# rather than an oversight: `terraform apply` for this project creates IAM
# roles and inline policies (pinger, notifier, EC2 instance profile), and
# `packer build` creates EC2 instances, keypairs, security groups, AMIs and
# snapshots. A hand-scoped policy covering that surface is large and breaks
# every time a resource type is added. Tighten this if the account is ever
# shared with anything else.
variable "github_deploy_policy_arn" {
  description = "Managed policy attached to the GitHub Actions deploy role."
  type        = string
  default     = "arn:aws:iam::aws:policy/AdministratorAccess"
}
