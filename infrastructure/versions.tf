# Terraform + provider version constraints for the PulseMonitor infrastructure.
# Pinned to keep local, CI, and future teammates on compatible tooling.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
