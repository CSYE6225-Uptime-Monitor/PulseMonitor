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
