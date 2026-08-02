# TDD: verifies the remote-state backing store is defined securely.
# Runs offline with command = plan (planning new resources makes no AWS calls).

run "state_store_is_secure" {
  command = plan

  assert {
    condition     = aws_s3_bucket_versioning.state.versioning_configuration[0].status == "Enabled"
    error_message = "State bucket must have versioning enabled to recover prior state."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_acls && aws_s3_bucket_public_access_block.state.block_public_policy && aws_s3_bucket_public_access_block.state.ignore_public_acls && aws_s3_bucket_public_access_block.state.restrict_public_buckets
    error_message = "State bucket must block all public access."
  }

  assert {
    condition     = aws_dynamodb_table.locks.hash_key == "LockID"
    error_message = "Lock table must use LockID as its hash key for the S3 backend."
  }
}
