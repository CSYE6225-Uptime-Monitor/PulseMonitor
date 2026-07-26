# Module: storage
# Responsibility: durable data stores for PulseMonitor.
#
# Layer scope:
#   - DynamoDB "users" table (auth accounts) — implemented below.
#   - S3 bucket: user data
#   - S3 bucket: audit logs
#   - S3 bucket: monitoring history
#     (all versioned, encrypted, public access blocked)
#   - DynamoDB "sites" table (monitored sites config/status)
#
# TODO(sprint-storage): declare the S3 buckets and sites table above.

resource "aws_dynamodb_table" "users" {
  name         = "${var.project_name}-${var.environment}-users"
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

  tags = { Name = "${var.project_name}-${var.environment}-users" }
}
