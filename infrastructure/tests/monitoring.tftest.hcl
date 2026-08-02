# TDD: verifies the monitoring module's pinger Lambda, EventBridge schedule,
# and least-privilege IAM. Runs offline (mocked "aws" provider). The "archive"
# provider is deliberately NOT mocked, so this also proves lambda/pinger/
# actually exists and zips - a real, local-only operation.
#
# aws_iam_role is mocked with a valid ARN shape: aws_lambda_function.pinger's
# "role" argument is ARN-validated even under mock_provider, and an unmocked
# computed "arn" attribute is a random string that fails that validation.
mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock-role"
    }
  }

  mock_resource "aws_lambda_function" {
    defaults = {
      arn = "arn:aws:lambda:us-east-1:123456789012:function:mock-function"
    }
  }

  mock_resource "aws_cloudwatch_event_rule" {
    defaults = {
      arn = "arn:aws:events:us-east-1:123456789012:rule/mock-rule"
    }
  }

  mock_resource "aws_iam_instance_profile" {
    defaults = {
      arn = "arn:aws:iam::123456789012:instance-profile/mock-profile"
    }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn      = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock-alb/1234567890123456"
      dns_name = "mock-alb-123456789.us-east-1.elb.amazonaws.com"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = {
      arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock-tg/1234567890123456"
    }
  }

  mock_resource "aws_launch_template" {
    defaults = {
      id = "lt-0123456789abcdef0"
    }
  }

  mock_data "aws_ami" {
    defaults = {
      id = "ami-0123456789abcdef0"
    }
  }
}

run "monitoring_outputs_are_wired" {
  command = apply

  assert {
    condition     = module.monitoring.pinger_function_arn != null
    error_message = "Monitoring module should output the pinger function ARN."
  }

  assert {
    condition     = module.monitoring.pinger_log_group_name == "/aws/lambda/pulsemonitor-dev-pinger"
    error_message = "Monitoring module should output the pinger log group name."
  }

  assert {
    condition     = module.monitoring.ping_schedule_rule_arn != null
    error_message = "Monitoring module should output the EventBridge schedule rule ARN."
  }
}

run "pinger_lambda_is_configured" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    project_name                  = "pulsemonitor"
    environment                   = "dev"
    sites_table_name              = "pulsemonitor-dev-sites"
    sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
    monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
    monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
  }

  assert {
    condition     = aws_lambda_function.pinger.runtime == "nodejs20.x"
    error_message = "Pinger Lambda must run on nodejs20.x."
  }

  assert {
    condition     = aws_lambda_function.pinger.handler == "index.handler"
    error_message = "Pinger Lambda handler must be index.handler."
  }

  assert {
    condition     = aws_lambda_function.pinger.timeout == 120
    error_message = "Pinger Lambda should default to a 120s timeout."
  }

  assert {
    condition     = aws_lambda_function.pinger.reserved_concurrent_executions == 1
    error_message = "Pinger Lambda should be limited to one concurrent execution."
  }

  assert {
    condition     = data.archive_file.pinger.output_base64sha256 != ""
    error_message = "The archive_file data source should successfully zip lambda/pinger/ - proves the source directory exists."
  }
}

run "schedule_invokes_the_pinger_every_five_minutes" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    project_name                  = "pulsemonitor"
    environment                   = "dev"
    sites_table_name              = "pulsemonitor-dev-sites"
    sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
    monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
    monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
  }

  assert {
    condition     = aws_cloudwatch_event_rule.ping_schedule.schedule_expression == "rate(5 minutes)"
    error_message = "Pinger should run on a 5-minute schedule by default."
  }

  assert {
    condition     = aws_cloudwatch_event_rule.ping_schedule.state == "ENABLED"
    error_message = "Pinger schedule rule should be enabled by default."
  }

  assert {
    condition     = aws_cloudwatch_event_target.pinger.rule == aws_cloudwatch_event_rule.ping_schedule.name
    error_message = "EventBridge target should point at the schedule rule."
  }

  assert {
    condition     = aws_lambda_permission.allow_eventbridge.principal == "events.amazonaws.com"
    error_message = "EventBridge must be granted permission to invoke the pinger."
  }
}

run "log_group_is_explicit_and_retained" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    project_name                  = "pulsemonitor"
    environment                   = "dev"
    sites_table_name              = "pulsemonitor-dev-sites"
    sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
    monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
    monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
  }

  assert {
    condition     = aws_cloudwatch_log_group.pinger.name == "/aws/lambda/pulsemonitor-dev-pinger"
    error_message = "Log group name should match the function name."
  }

  assert {
    condition     = aws_cloudwatch_log_group.pinger.retention_in_days == 14
    error_message = "Log group should default to 14-day retention."
  }
}

run "pinger_role_is_least_privilege" {
  # apply (not plan): the policy JSON embeds aws_cloudwatch_log_group.pinger.arn,
  # a computed attribute of another resource in this same plan, which stays
  # unknown until apply even under mock_provider.
  command = apply

  module {
    source = "./modules/monitoring"
  }

  variables {
    project_name                  = "pulsemonitor"
    environment                   = "dev"
    sites_table_name              = "pulsemonitor-dev-sites"
    sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
    monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
    monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
  }

  assert {
    condition     = jsondecode(aws_iam_role.pinger.assume_role_policy).Statement[0].Principal.Service == "lambda.amazonaws.com"
    error_message = "Pinger role must only be assumable by the Lambda service."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.pinger.policy).Statement :
      contains(s.Action, "s3:PutObject") && length([for r in s.Resource : r if endswith(r, "/sites/*")]) > 0
    ])
    error_message = "Pinger's S3 write access must be scoped to the sites/ prefix."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.pinger.policy).Statement :
      s if length(setintersection(toset(s.Action), toset([
        "dynamodb:DeleteItem", "dynamodb:PutItem", "dynamodb:BatchWriteItem",
        "s3:DeleteObject", "s3:GetObject", "logs:CreateLogGroup",
      ]))) > 0
    ]) == 0
    error_message = "Pinger role must not have write/delete/read permissions beyond Scan+UpdateItem+PutObject."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.pinger.policy).Statement :
      s if contains(s.Resource, "*")
    ]) == 0
    error_message = "No statement in the pinger policy should use a wildcard resource."
  }
}

run "rejects_ping_timeout_longer_than_lambda_timeout" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    project_name                  = "pulsemonitor"
    environment                   = "dev"
    sites_table_name              = "pulsemonitor-dev-sites"
    sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
    monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
    monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
    ping_timeout_ms               = 300000
  }

  expect_failures = [var.ping_timeout_ms]
}
