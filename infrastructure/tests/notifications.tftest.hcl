# TDD: verifies the site down/recovery notification pipeline (custom
# EventBridge bus, notifier Lambda, SES). Runs offline (mocked "aws"
# provider). The "archive" provider is deliberately NOT mocked, so this also
# proves lambda/notifier/ actually exists and zips.
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

  mock_resource "aws_cloudwatch_event_bus" {
    defaults = {
      arn = "arn:aws:events:us-east-1:123456789012:event-bus/mock-bus"
    }
  }

  mock_resource "aws_sqs_queue" {
    defaults = {
      arn = "arn:aws:sqs:us-east-1:123456789012:mock-queue"
      url = "https://sqs.us-east-1.amazonaws.com/123456789012/mock-queue"
    }
  }

  mock_resource "aws_sesv2_email_identity" {
    defaults = {
      arn = "arn:aws:ses:us-east-1:123456789012:identity/mock-identity"
    }
  }

  mock_resource "aws_sesv2_configuration_set" {
    defaults = {
      arn = "arn:aws:ses:us-east-1:123456789012:configuration-set/mock-configuration-set"
    }
  }
}

# Shared variables for every module-level run below: the pinger's required
# inputs plus the users table + notification inputs this feature adds.
variables {
  project_name                  = "pulsemonitor"
  environment                   = "dev"
  sites_table_name              = "pulsemonitor-dev-sites"
  sites_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
  users_table_name              = "pulsemonitor-dev-users"
  users_table_arn               = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-users"
  users_user_id_index_arn       = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-users/index/user_id-index"
  monitoring_history_bucket     = "pulsemonitor-dev-monitoring-history-123456789012"
  monitoring_history_bucket_arn = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"

  enable_notifications       = true
  notification_sender_domain = "pulsemonitor.online"
  notification_sender_email  = "alerts@pulsemonitor.online"
}

run "notifications_are_absent_by_default" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    enable_notifications       = false
    notification_sender_domain = ""
    notification_sender_email  = ""
  }

  assert {
    condition     = length(aws_lambda_function.notifier) == 0
    error_message = "Notifier Lambda must not be created when enable_notifications is false."
  }

  assert {
    condition     = length(aws_cloudwatch_event_bus.site_events) == 0
    error_message = "Custom event bus must not be created when enable_notifications is false."
  }

  assert {
    condition     = length(aws_cloudwatch_event_rule.site_down) == 0 && length(aws_cloudwatch_event_rule.site_recovered) == 0
    error_message = "Down/recovery rules must not be created when enable_notifications is false."
  }

  assert {
    condition     = length(aws_sqs_queue.notifier_dlq) == 0
    error_message = "Notifier DLQ must not be created when enable_notifications is false."
  }

  assert {
    condition     = length(aws_sesv2_email_identity.sender) == 0
    error_message = "SES sender identity must not be created when enable_notifications is false."
  }
}

run "pinger_cannot_publish_when_notifications_are_disabled" {
  # apply (not plan): the policy JSON embeds computed ARNs from other
  # resources in this plan (e.g. the log group), which stay unknown until
  # apply even under mock_provider - mirrors pinger_role_is_least_privilege
  # in monitoring.tftest.hcl.
  command = apply

  module {
    source = "./modules/monitoring"
  }

  variables {
    enable_notifications       = false
    notification_sender_domain = ""
    notification_sender_email  = ""
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.pinger.policy).Statement :
      s if contains(s.Action, "events:PutEvents")
    ]) == 0
    error_message = "Pinger must not have events:PutEvents when enable_notifications is false."
  }

  assert {
    condition     = lookup(aws_lambda_function.pinger.environment[0].variables, "EVENT_BUS_NAME", "") == ""
    error_message = "Pinger must not have EVENT_BUS_NAME set when enable_notifications is false."
  }
}

run "notifier_lambda_is_configured" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition     = one(aws_lambda_function.notifier).runtime == "nodejs22.x"
    error_message = "Notifier Lambda must run on nodejs22.x."
  }

  assert {
    condition     = one(aws_lambda_function.notifier).architectures[0] == "arm64"
    error_message = "Notifier Lambda must run on arm64, matching the pinger."
  }

  assert {
    condition     = one(aws_lambda_function.notifier).handler == "index.handler"
    error_message = "Notifier Lambda handler must be index.handler."
  }

  assert {
    condition     = one(aws_lambda_function.notifier).reserved_concurrent_executions == -1
    error_message = "Notifier must default to unreserved concurrency (-1) - see var.lambda_reserved_concurrency."
  }

  assert {
    condition     = one(data.archive_file.notifier).output_base64sha256 != ""
    error_message = "The archive_file data source should successfully zip lambda/notifier/ - proves the source directory exists."
  }
}

run "down_rule_fires_on_any_transition_to_down" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition     = jsondecode(one(aws_cloudwatch_event_rule.site_down).event_pattern).source[0] == "pulsemonitor.pinger"
    error_message = "Down rule must match events from the pinger."
  }

  assert {
    condition     = jsondecode(one(aws_cloudwatch_event_rule.site_down).event_pattern)["detail-type"][0] == "SiteStatusChanged"
    error_message = "Down rule must match SiteStatusChanged events."
  }

  assert {
    condition     = jsondecode(one(aws_cloudwatch_event_rule.site_down).event_pattern).detail.status[0] == "down"
    error_message = "Down rule must match status=down."
  }

  assert {
    condition     = !contains(keys(jsondecode(one(aws_cloudwatch_event_rule.site_down).event_pattern).detail), "previous_status")
    error_message = "The down rule must not constrain previous_status, or a newly added site that is already down would never alert."
  }

  assert {
    condition     = one(aws_cloudwatch_event_rule.site_down).event_bus_name == "pulsemonitor-dev-site-events"
    error_message = "Down rule must sit on the custom bus, not the default bus."
  }
}

run "recovery_rule_requires_a_previous_down" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition     = jsondecode(one(aws_cloudwatch_event_rule.site_recovered).event_pattern).detail.status[0] == "up"
    error_message = "Recovery rule must match status=up."
  }

  assert {
    condition     = jsondecode(one(aws_cloudwatch_event_rule.site_recovered).event_pattern).detail.previous_status[0] == "down"
    error_message = "The recovery rule must require previous_status == down, or a brand-new site's first successful check emails the owner that it 'recovered' from a down state it was never in."
  }
}

run "both_rules_target_the_notifier" {
  # apply (not plan): aws_lambda_permission.allow_eventbridge_notifier's
  # source_arn depends on aws_cloudwatch_event_rule ARNs referenced through a
  # for_each, which - like the policy JSON assertions elsewhere in this
  # module - stays unknown under mock_provider until apply.
  command = apply

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition     = one(aws_cloudwatch_event_target.site_down).rule == one(aws_cloudwatch_event_rule.site_down).name
    error_message = "site_down target must point at the site_down rule."
  }

  assert {
    condition     = one(aws_cloudwatch_event_target.site_recovered).rule == one(aws_cloudwatch_event_rule.site_recovered).name
    error_message = "site_recovered target must point at the site_recovered rule."
  }

  assert {
    condition     = length(one(aws_cloudwatch_event_target.site_down).dead_letter_config) == 1 && length(one(aws_cloudwatch_event_target.site_recovered).dead_letter_config) == 1
    error_message = "Both targets must have a dead_letter_config."
  }

  assert {
    condition     = lookup(one(aws_cloudwatch_event_target.site_down), "input", null) == null
    error_message = "Targets must not set input - it replaces the payload and would hand the notifier an empty event (see aws_cloudwatch_event_target.pinger's input=jsonencode({source=\"schedule\"}))."
  }

  assert {
    # Under mock_provider every aws_cloudwatch_event_rule instance resolves
    # to the same mocked ARN, so source_arn distinctness isn't observable
    # here - that's a mocking artifact, not a real-world outcome. What this
    # can prove offline: there are exactly two permissions, one keyed to
    # each rule, each with a distinct statement_id (which the config derives
    # from the for_each key, not from the mocked ARN).
    condition = (
      length(aws_lambda_permission.allow_eventbridge_notifier) == 2 &&
      length(distinct([for p in aws_lambda_permission.allow_eventbridge_notifier : p.statement_id])) == 2 &&
      aws_lambda_permission.allow_eventbridge_notifier["down"].source_arn == one(aws_cloudwatch_event_rule.site_down).arn &&
      aws_lambda_permission.allow_eventbridge_notifier["recovered"].source_arn == one(aws_cloudwatch_event_rule.site_recovered).arn
    )
    error_message = "There must be two lambda permissions, one per rule, each with a distinct statement_id, wired to its own rule's ARN."
  }
}

run "notifier_role_is_least_privilege" {
  command = apply

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.notifier[0].policy).Statement :
      contains(s.Action, "dynamodb:Query") && length([for r in s.Resource : r if endswith(r, "/index/user_id-index")]) > 0
    ])
    error_message = "Notifier must Query the user_id-index GSI, scoped to the index ARN."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.notifier[0].policy).Statement :
      s if length(setintersection(toset(s.Action), toset([
        "dynamodb:GetItem", "dynamodb:Scan", "dynamodb:BatchGetItem", "dynamodb:UpdateItem",
        "dynamodb:PutItem", "dynamodb:DeleteItem", "ses:SendRawEmail", "logs:CreateLogGroup",
      ]))) > 0
    ]) == 0
    error_message = "Notifier role must not have permissions beyond Query+SendEmail+SendMessage+logs."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.notifier[0].policy).Statement :
      contains(s.Action, "ses:SendEmail")
    ])
    error_message = "Notifier must be able to send email via SES."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.notifier[0].policy).Statement :
      s if contains(s.Resource, "*")
    ]) == 0
    error_message = "No statement in the notifier policy should use a wildcard resource."
  }
}

run "pinger_may_publish_only_to_the_notifications_bus" {
  command = apply

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.pinger.policy).Statement :
      contains(s.Action, "events:PutEvents") && length(s.Resource) == 1 && !contains(s.Resource, "*")
    ])
    error_message = "Pinger must be able to publish only to the custom notifications bus, not a wildcard resource."
  }

  assert {
    condition     = aws_lambda_function.pinger.environment[0].variables["EVENT_BUS_NAME"] == "pulsemonitor-dev-site-events"
    error_message = "Pinger must have EVENT_BUS_NAME set to the custom bus name."
  }
}

run "dlq_retains_undeliverable_notifications" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  assert {
    condition     = one(aws_sqs_queue.notifier_dlq).message_retention_seconds == 1209600
    error_message = "Notifier DLQ should retain messages for the maximum 14 days."
  }

  assert {
    condition     = one(aws_lambda_function_event_invoke_config.notifier).maximum_retry_attempts == 1
    error_message = "Notifier function-error retries should be capped at 1."
  }
}

run "requires_a_sender_domain_and_email_when_notifications_are_enabled" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    enable_notifications = true
    # Pinned rather than left to the default: a module-level run that
    # doesn't set this still inherits a developer's local terraform.tfvars
    # value for it (terraform test applies root tfvars by name even into
    # module { source = ... } runs) - and a leaked "email" here would make
    # the domain validation below a silent no-op.
    notification_sender_identity_type = "domain"
    notification_sender_domain        = ""
    notification_sender_email         = ""
  }

  expect_failures = [
    var.notification_sender_domain,
    var.notification_sender_email,
  ]
}

run "override_recipient_is_forbidden_in_prod" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    environment                     = "prod"
    notification_override_recipient = "ops@example.com"
  }

  expect_failures = [
    var.notification_override_recipient,
  ]
}

run "reserved_concurrency_is_plumbed_when_the_quota_allows_it" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    lambda_reserved_concurrency = 1
  }

  assert {
    condition     = aws_lambda_function.pinger.reserved_concurrent_executions == 1
    error_message = "lambda_reserved_concurrency must reach the pinger."
  }

  assert {
    condition     = one(aws_lambda_function.notifier).reserved_concurrent_executions == 1
    error_message = "lambda_reserved_concurrency must reach the notifier."
  }
}

run "email_identity_mode_uses_the_from_address_as_the_ses_identity" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    notification_sender_identity_type = "email"
    notification_sender_domain        = ""
    notification_sender_email         = "ops@example.com"
  }

  assert {
    condition     = one(aws_sesv2_email_identity.sender).email_identity == "ops@example.com"
    error_message = "In email mode the SES identity must be the From address itself - SES rejects a SendEmail whose From is not the verified identity."
  }
}

run "sender_email_must_not_also_be_a_verified_recipient_in_email_mode" {
  command = plan

  module {
    source = "./modules/monitoring"
  }

  variables {
    notification_sender_identity_type = "email"
    notification_sender_domain        = ""
    notification_sender_email         = "ops@example.com"
    notification_verified_recipients  = ["ops@example.com"]
  }

  expect_failures = [
    var.notification_verified_recipients,
  ]
}
