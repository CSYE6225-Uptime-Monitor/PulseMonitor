# Remote-state bootstrap for PulseMonitor.
#
# One-time setup that creates the S3 bucket (state storage) and DynamoDB table
# (state locking) that the root module's S3 backend depends on.
#
# NOT applied during the init sprint. When ready:
#   cd infrastructure/bootstrap
#   terraform init && terraform apply
# then copy the outputs into infrastructure/backend.hcl and run
# `terraform init -backend-config=backend.hcl` in the root module.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "Terraform"
      Purpose   = "remote-state-bootstrap"
    }
  }
}

# --- State storage -----------------------------------------------------------

resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# --- State locking -----------------------------------------------------------

resource "aws_dynamodb_table" "locks" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# --- GitHub Actions CD -------------------------------------------------------
#
# Lives in bootstrap rather than the root module on purpose: this is the role
# the root module's own `terraform apply` runs as, so it cannot be created by
# that apply. Bootstrap is the one-time, manually-applied layer - same
# reasoning as the state bucket it sits next to.
#
# No thumbprint_list: it is Optional+Computed in AWS provider v5, and AWS
# validates token.actions.githubusercontent.com against its own trust store
# rather than a pinned certificate fingerprint - so there is nothing to
# rotate here when GitHub's cert changes.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.enable_github_oidc ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = []

  tags = { Name = "${var.project_name}-github-oidc" }
}

resource "aws_iam_role" "github_deploy" {
  count = var.enable_github_oidc ? 1 : 0

  name        = "${var.project_name}-github-deploy"
  description = "Assumed via OIDC by .github/workflows/deploy.yml to build the AMI and apply Terraform."

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "GitHubActionsOIDC"
      Effect = "Allow"
      Principal = {
        Federated = aws_iam_openid_connect_provider.github[0].arn
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        # aud pins the audience so a token minted for another cloud can't be
        # replayed here; sub pins which repo AND which ref may assume it.
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = [
            for subject in var.github_allowed_subjects :
            "repo:${var.github_repository}:${subject}"
          ]
        }
      }
    }]
  })

  tags = { Name = "${var.project_name}-github-deploy" }
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  count = var.enable_github_oidc ? 1 : 0

  role       = aws_iam_role.github_deploy[0].name
  policy_arn = var.github_deploy_policy_arn
}
