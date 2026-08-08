# Module: storage
# Responsibility: durable data stores for PulseMonitor.
#
# Layer scope:
#   - DynamoDB "users" table (auth accounts)
#   - DynamoDB "sites" table (monitored sites config/status)
#   - S3 bucket: user data
#   - S3 bucket: audit logs
#   - S3 bucket: monitoring history (versioned, encrypted, public access blocked)

data "aws_caller_identity" "current" {}

locals {
  name_prefix   = "${var.project_name}-${var.environment}"
  bucket_suffix = coalesce(var.bucket_name_suffix, data.aws_caller_identity.current.account_id)

  buckets = {
    user_data = {
      name = "${local.name_prefix}-user-data-${local.bucket_suffix}"
    }
    audit_logs = {
      name = "${local.name_prefix}-audit-logs-${local.bucket_suffix}"
    }
    monitoring_history = {
      name = "${local.name_prefix}-monitoring-history-${local.bucket_suffix}"
    }
  }
}

resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "email"

  attribute {
    name = "email"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = { Name = "${local.name_prefix}-users" }
}

resource "aws_dynamodb_table" "sites" {
  name         = "${local.name_prefix}-sites"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"
  range_key    = "site_id"

  attribute {
    name = "user_id"
    type = "S"
  }

  attribute {
    name = "site_id"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = { Name = "${local.name_prefix}-sites" }
}

# S3 buckets -----------------------------------------------------------

resource "aws_s3_bucket" "user_data" {
  bucket        = local.buckets.user_data.name
  force_destroy = var.bucket_force_destroy

  tags = { Name = local.buckets.user_data.name }
}

resource "aws_s3_bucket" "audit_logs" {
  bucket        = local.buckets.audit_logs.name
  force_destroy = var.bucket_force_destroy

  tags = { Name = local.buckets.audit_logs.name }
}

resource "aws_s3_bucket" "monitoring_history" {
  bucket        = local.buckets.monitoring_history.name
  force_destroy = var.bucket_force_destroy

  tags = { Name = local.buckets.monitoring_history.name }
}

resource "aws_s3_bucket_versioning" "user_data" {
  bucket = aws_s3_bucket.user_data.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_versioning" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_versioning" "monitoring_history" {
  bucket = aws_s3_bucket.monitoring_history.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "user_data" {
  bucket = aws_s3_bucket.user_data.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "monitoring_history" {
  bucket = aws_s3_bucket.monitoring_history.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "user_data" {
  bucket                  = aws_s3_bucket.user_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "audit_logs" {
  bucket                  = aws_s3_bucket.audit_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "monitoring_history" {
  bucket                  = aws_s3_bucket.monitoring_history.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "user_data" {
  bucket = aws_s3_bucket.user_data.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_ownership_controls" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_ownership_controls" "monitoring_history" {
  bucket = aws_s3_bucket.monitoring_history.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

# Monitoring-history bucket keeps raw pings for a bounded window. Versioning is
# on, so `expiration` alone only writes delete markers - without the
# noncurrent-version rule the raw pings would be retained (and billed) forever.
resource "aws_s3_bucket_lifecycle_configuration" "monitoring_history" {
  bucket = aws_s3_bucket.monitoring_history.id

  rule {
    id     = "expire-raw-pings"
    status = "Enabled"

    filter {
      prefix = var.raw_ping_prefix
    }

    expiration {
      days = var.monitoring_history_retention_days
    }
  }

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "abort-incomplete-mpu"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.monitoring_history]
}

# user-data bucket keeps exports for a short, bounded window. Same
# noncurrent-version trap as monitoring_history above: versioning is on, so
# `expiration` alone only writes delete markers, leaving every export byte
# billed forever.
resource "aws_s3_bucket_lifecycle_configuration" "user_data" {
  bucket = aws_s3_bucket.user_data.id

  rule {
    id     = "expire-exports"
    status = "Enabled"

    filter {
      prefix = var.export_prefix
    }

    expiration {
      days = var.export_retention_days
    }
  }

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "abort-incomplete-mpu"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.user_data]
}

# audit-logs bucket keeps events for a longer window than exports - this is
# an activity-feed retention policy, not a compliance guarantee (see
# backend/src/middleware/audit.js: a write here can be lost if the instance
# terminates mid-request). Same noncurrent-version trap as the other buckets.
resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  bucket = aws_s3_bucket.audit_logs.id

  rule {
    id     = "expire-audit-events"
    status = "Enabled"

    filter {
      prefix = var.audit_prefix
    }

    expiration {
      days = var.audit_retention_days
    }
  }

  rule {
    id     = "expire-noncurrent"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "abort-incomplete-mpu"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  depends_on = [aws_s3_bucket_versioning.audit_logs]
}
