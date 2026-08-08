# Copy these into infrastructure/backend.hcl after applying the bootstrap.

output "state_bucket_name" {
  description = "S3 bucket holding Terraform remote state."
  value       = aws_s3_bucket.state.id
}

output "lock_table_name" {
  description = "DynamoDB table used for state locking."
  value       = aws_dynamodb_table.locks.name
}
output "state_bucket_arn" {
  description = "ARN of the S3 bucket holding Terraform remote state."
  value       = aws_s3_bucket.state.arn
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB table used for state locking."
  value       = aws_dynamodb_table.locks.arn
}

output "github_deploy_role_arn" {
  description = "Set this as the AWS_DEPLOY_ROLE_ARN GitHub repository variable so .github/workflows/deploy.yml can assume it. Null when enable_github_oidc is false."
  value       = one(aws_iam_role.github_deploy[*].arn)
}
