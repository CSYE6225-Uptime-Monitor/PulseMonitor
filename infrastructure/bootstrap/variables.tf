# Bootstrap input variables.
# Bucket names are globally unique — override state_bucket_name before applying.

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
