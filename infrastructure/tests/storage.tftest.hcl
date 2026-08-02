# TDD: verifies the storage module's DynamoDB tables and S3 buckets.
# Runs offline (mocked "aws" provider, no real AWS calls or credentials needed).

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
}

run "storage_outputs_are_exposed" {
  command = apply

  assert {
    condition     = module.storage.users_table_name == "pulsemonitor-dev-users"
    error_message = "Storage module should output the users table name."
  }

  assert {
    condition     = module.storage.users_table_arn != null
    error_message = "Storage module should output the users table ARN."
  }

  assert {
    condition     = module.storage.sites_table_name == "pulsemonitor-dev-sites"
    error_message = "Storage module should output the sites table name."
  }

  assert {
    condition     = module.storage.sites_table_arn != null
    error_message = "Storage module should output the sites table ARN."
  }

  assert {
    condition     = module.storage.user_data_bucket_name != null && module.storage.user_data_bucket_arn != null
    error_message = "Storage module should output the user-data bucket name and ARN."
  }

  assert {
    condition     = module.storage.audit_logs_bucket_name != null && module.storage.audit_logs_bucket_arn != null
    error_message = "Storage module should output the audit-logs bucket name and ARN."
  }

  assert {
    condition     = module.storage.monitoring_history_bucket_name != null && module.storage.monitoring_history_bucket_arn != null
    error_message = "Storage module should output the monitoring-history bucket name and ARN."
  }
}

# Unit-tests the storage module directly (not via the root wiring) so we can
# assert on the DynamoDB resource's own schema attributes.
run "users_table_is_on_demand_and_encrypted" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name = "pulsemonitor"
    environment  = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.users.hash_key == "email"
    error_message = "Users table must use email as its hash key."
  }

  assert {
    condition     = aws_dynamodb_table.users.billing_mode == "PAY_PER_REQUEST"
    error_message = "Users table must use on-demand (PAY_PER_REQUEST) billing."
  }

  assert {
    condition     = aws_dynamodb_table.users.server_side_encryption[0].enabled == true
    error_message = "Users table must have server-side encryption enabled."
  }

  assert {
    condition     = aws_dynamodb_table.users.point_in_time_recovery[0].enabled == true
    error_message = "Users table must have point-in-time recovery enabled."
  }
}

run "sites_table_key_schema" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name = "pulsemonitor"
    environment  = "dev"
  }

  assert {
    condition     = aws_dynamodb_table.sites.hash_key == "user_id"
    error_message = "Sites table must use user_id as its partition key."
  }

  assert {
    condition     = aws_dynamodb_table.sites.range_key == "site_id"
    error_message = "Sites table must use site_id as its sort key."
  }

  assert {
    condition     = aws_dynamodb_table.sites.billing_mode == "PAY_PER_REQUEST"
    error_message = "Sites table must use on-demand (PAY_PER_REQUEST) billing."
  }

  assert {
    condition     = aws_dynamodb_table.sites.server_side_encryption[0].enabled == true
    error_message = "Sites table must have server-side encryption enabled."
  }

  assert {
    condition     = aws_dynamodb_table.sites.point_in_time_recovery[0].enabled == true
    error_message = "Sites table must have point-in-time recovery enabled."
  }
}

run "buckets_are_encrypted_versioned_and_private" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name = "pulsemonitor"
    environment  = "dev"
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.user_data.block_public_acls,
      aws_s3_bucket_public_access_block.user_data.block_public_policy,
      aws_s3_bucket_public_access_block.user_data.ignore_public_acls,
      aws_s3_bucket_public_access_block.user_data.restrict_public_buckets,
    ])
    error_message = "user-data bucket must block all public access."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.audit_logs.block_public_acls,
      aws_s3_bucket_public_access_block.audit_logs.block_public_policy,
      aws_s3_bucket_public_access_block.audit_logs.ignore_public_acls,
      aws_s3_bucket_public_access_block.audit_logs.restrict_public_buckets,
    ])
    error_message = "audit-logs bucket must block all public access."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.monitoring_history.block_public_acls,
      aws_s3_bucket_public_access_block.monitoring_history.block_public_policy,
      aws_s3_bucket_public_access_block.monitoring_history.ignore_public_acls,
      aws_s3_bucket_public_access_block.monitoring_history.restrict_public_buckets,
    ])
    error_message = "monitoring-history bucket must block all public access."
  }

  assert {
    condition     = tolist(aws_s3_bucket_server_side_encryption_configuration.user_data.rule)[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "user-data bucket must be encrypted with AES256."
  }

  assert {
    condition     = tolist(aws_s3_bucket_server_side_encryption_configuration.audit_logs.rule)[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "audit-logs bucket must be encrypted with AES256."
  }

  assert {
    condition     = tolist(aws_s3_bucket_server_side_encryption_configuration.monitoring_history.rule)[0].apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "monitoring-history bucket must be encrypted with AES256."
  }

  assert {
    condition     = aws_s3_bucket_versioning.user_data.versioning_configuration[0].status == "Enabled"
    error_message = "user-data bucket must have versioning enabled."
  }

  assert {
    condition     = aws_s3_bucket_versioning.audit_logs.versioning_configuration[0].status == "Enabled"
    error_message = "audit-logs bucket must have versioning enabled."
  }

  assert {
    condition     = aws_s3_bucket_versioning.monitoring_history.versioning_configuration[0].status == "Enabled"
    error_message = "monitoring-history bucket must have versioning enabled."
  }

  assert {
    condition     = aws_s3_bucket_ownership_controls.user_data.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "user-data bucket must disable ACLs via BucketOwnerEnforced."
  }
}

run "bucket_names_are_globally_unique" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name = "pulsemonitor"
    environment  = "dev"
  }

  assert {
    condition     = aws_s3_bucket.user_data.bucket == "pulsemonitor-dev-user-data-123456789012"
    error_message = "user-data bucket name should be suffixed with the account ID by default."
  }

  assert {
    condition     = length(aws_s3_bucket.monitoring_history.bucket) <= 63
    error_message = "monitoring-history bucket name must not exceed the S3 63-character limit."
  }
}

run "bucket_name_suffix_override_wins" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name       = "pulsemonitor"
    environment        = "dev"
    bucket_name_suffix = "abc123"
  }

  assert {
    condition     = aws_s3_bucket.user_data.bucket == "pulsemonitor-dev-user-data-abc123"
    error_message = "Explicit bucket_name_suffix should override the account-ID default."
  }
}

run "monitoring_history_expires_raw_pings" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name = "pulsemonitor"
    environment  = "dev"
  }

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.monitoring_history.rule :
      r.id == "expire-raw-pings" && r.status == "Enabled" && r.expiration[0].days == 90 && r.filter[0].prefix == "sites/"
    ])
    error_message = "monitoring-history bucket must expire raw pings after 90 days under the sites/ prefix."
  }

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.monitoring_history.rule :
      r.id == "expire-noncurrent" && can(r.noncurrent_version_expiration[0].noncurrent_days)
    ])
    error_message = "monitoring-history bucket must expire noncurrent versions, otherwise raw pings are retained forever despite the expiration rule."
  }
}

run "monitoring_history_retention_is_configurable" {
  command = plan

  module {
    source = "./modules/storage"
  }

  variables {
    project_name                      = "pulsemonitor"
    environment                       = "dev"
    monitoring_history_retention_days = 30
  }

  assert {
    condition = anytrue([
      for r in aws_s3_bucket_lifecycle_configuration.monitoring_history.rule :
      r.id == "expire-raw-pings" && r.expiration[0].days == 30
    ])
    error_message = "monitoring_history_retention_days should flow through to the lifecycle rule."
  }
}
