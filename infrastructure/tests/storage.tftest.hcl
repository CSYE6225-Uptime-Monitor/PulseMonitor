# TDD: verifies the storage module's DynamoDB users table.
# Runs offline (mocked "aws" provider, no real AWS calls or credentials needed).

mock_provider "aws" {}

run "users_table_name_is_output" {
  command = apply

  assert {
    condition     = module.storage.users_table_name == "pulsemonitor-dev-users"
    error_message = "Storage module should output the users table name."
  }

  assert {
    condition     = module.storage.users_table_arn != null
    error_message = "Storage module should output the users table ARN."
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
