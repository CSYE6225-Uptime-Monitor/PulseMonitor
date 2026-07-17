# TDD: verifies the root module's input-variable contracts.
# Runs fully offline (empty plan, no AWS credentials, no resources created).

run "defaults_are_valid" {
  command = plan

  assert {
    condition     = var.aws_region == "us-east-1"
    error_message = "Default region should be us-east-1."
  }

  assert {
    condition     = length(var.availability_zones) >= 2
    error_message = "Default layout must span at least two availability zones."
  }
}

run "rejects_invalid_environment" {
  command = plan

  variables {
    environment = "production"
  }

  expect_failures = [
    var.environment,
  ]
}

run "rejects_bad_cidr" {
  command = plan

  variables {
    vpc_cidr = "not-a-cidr"
  }

  expect_failures = [
    var.vpc_cidr,
  ]
}
