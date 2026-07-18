# AWS provider configuration.
# default_tags are applied to every taggable resource so ownership and cost
# attribution are consistent across the whole PulseMonitor footprint.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Project     = var.project_name
        Environment = var.environment
        ManagedBy   = "Terraform"
      },
      var.tags,
    )
  }
}
