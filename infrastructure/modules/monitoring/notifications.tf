# Site down/recovery notifications.
#
# Layer scope:
#   - Custom EventBridge bus (the pinger publishes SiteStatusChanged events
#     here; nothing else touches the default bus)
#   - Two rules: site_down (any transition to down) and site_recovered (a
#     transition to up whose previous_status was down)
#   - Notifier Lambda + least-privilege IAM role (Query the users_id-index
#     GSI to resolve the owner's email, SendEmail via SES, SendMessage to the
#     DLQ on function-error destinations)
#   - SES domain identity (Easy DKIM) for the sender + a CloudWatch
#     configuration set for delivery/bounce/complaint visibility
#   - An SQS dead-letter queue for both EventBridge delivery failures and
#     Lambda function-error async-invoke failures
#
# Entirely additive and gated on var.enable_notifications (count = 0 when
# false), so this file has zero effect until explicitly turned on. Distinct
# from var.enable_alerts/var.alert_email in main.tf, which are the Sprint-4
# operator-facing SNS alarms - this is the per-user SES notification path.

locals {
  notifier_function_name  = "${local.name_prefix}-notifier"
  notifier_log_group_name = "/aws/lambda/${local.notifier_function_name}"
  site_events_bus_name    = "${local.name_prefix}-site-events"

  # SES requires the From address to BE the verified identity in email mode,
  # so deriving the identity from notification_sender_email (rather than
  # taking a third variable) makes that invariant structural.
  sender_identity = var.notification_sender_identity_type == "email" ? var.notification_sender_email : var.notification_sender_domain
}

# node_modules is bundled, same rationale as data.archive_file.pinger above:
# run `npm ci --omit=dev` in lambda/notifier/ before `terraform apply`.
data "archive_file" "notifier" {
  count = var.enable_notifications ? 1 : 0

  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/notifier"
  output_path = "${path.module}/build/notifier.zip"
  excludes    = ["coverage", "tests", "package-lock.json", "*.test.js", "README.md"]
}

resource "aws_cloudwatch_log_group" "notifier" {
  count = var.enable_notifications ? 1 : 0

  name              = local.notifier_log_group_name
  retention_in_days = var.notifier_log_retention_days

  tags = { Name = local.notifier_log_group_name }
}

resource "aws_iam_role" "notifier" {
  count = var.enable_notifications ? 1 : 0

  name = "${local.name_prefix}-notifier-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaAssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-notifier-role" }
}

# jsonencode(), not data.aws_iam_policy_document, matching aws_iam_role_policy.pinger:
# under mock_provider "aws" {} that data source returns placeholder JSON, which
# makes any test assertion on policy content meaningless.
resource "aws_iam_role_policy" "notifier" {
  count = var.enable_notifications ? 1 : 0

  name = "${local.name_prefix}-notifier-policy"
  role = aws_iam_role.notifier[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.notifier[0].arn}:*"]
      },
      {
        Sid      = "ResolveSiteOwnerEmail"
        Effect   = "Allow"
        Action   = ["dynamodb:Query"]
        Resource = [var.users_user_id_index_arn]
      },
      {
        Sid      = "SendTransitionEmail"
        Effect   = "Allow"
        Action   = ["ses:SendEmail"]
        Resource = [aws_sesv2_email_identity.sender[0].arn, aws_sesv2_configuration_set.notifications[0].arn]
        Condition = {
          StringEquals = { "ses:FromAddress" = var.notification_sender_email }
        }
      },
      {
        Sid      = "DeadLetterOnFailure"
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = [aws_sqs_queue.notifier_dlq[0].arn]
      },
    ]
  })
}

resource "aws_lambda_function" "notifier" {
  count = var.enable_notifications ? 1 : 0

  function_name = local.notifier_function_name
  role          = aws_iam_role.notifier[0].arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]

  filename         = data.archive_file.notifier[0].output_path
  source_code_hash = data.archive_file.notifier[0].output_base64sha256

  timeout = 15
  # The SES sandbox caps sending at 1 msg/sec: a reserved execution of 1
  # keeps a multi-site outage from firing a burst of concurrent sends that
  # would otherwise throttle against that ceiling. See
  # var.lambda_reserved_concurrency for why this defaults to -1 instead.
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      USERS_TABLE               = var.users_table_name
      USERS_USER_ID_INDEX       = "user_id-index"
      FROM_ADDRESS              = var.notification_sender_email
      CONFIGURATION_SET_NAME    = aws_sesv2_configuration_set.notifications[0].configuration_set_name
      NOTIFY_OVERRIDE_RECIPIENT = var.notification_override_recipient
      METRIC_NAMESPACE          = var.metric_namespace
      ENVIRONMENT               = var.environment
      LOG_LEVEL                 = var.log_level
    }
  }

  depends_on = [aws_cloudwatch_log_group.notifier, aws_iam_role_policy.notifier]

  tags = { Name = local.notifier_function_name }
}

resource "aws_lambda_function_event_invoke_config" "notifier" {
  count = var.enable_notifications ? 1 : 0

  function_name                = aws_lambda_function.notifier[0].function_name
  maximum_retry_attempts       = 1
  maximum_event_age_in_seconds = 300

  destination_config {
    on_failure {
      destination = aws_sqs_queue.notifier_dlq[0].arn
    }
  }
}

resource "aws_sqs_queue" "notifier_dlq" {
  count = var.enable_notifications ? 1 : 0

  name                      = "${local.name_prefix}-notifier-dlq"
  message_retention_seconds = 1209600 # 14 days - the maximum
  sqs_managed_sse_enabled   = true

  tags = { Name = "${local.name_prefix}-notifier-dlq" }
}

# Required for EventBridge's target dead_letter_config: without an explicit
# grant, AWS rejects the rule target at apply time because events.amazonaws.com
# has no permission to write to this queue.
resource "aws_sqs_queue_policy" "notifier_dlq" {
  count = var.enable_notifications ? 1 : 0

  queue_url = aws_sqs_queue.notifier_dlq[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowEventBridgeDeadLetter"
      Effect    = "Allow"
      Principal = { Service = "events.amazonaws.com" }
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.notifier_dlq[0].arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = [
            aws_cloudwatch_event_rule.site_down[0].arn,
            aws_cloudwatch_event_rule.site_recovered[0].arn,
          ]
        }
      }
    }]
  })
}

resource "aws_cloudwatch_event_bus" "site_events" {
  count = var.enable_notifications ? 1 : 0

  name = local.site_events_bus_name

  tags = { Name = local.site_events_bus_name }
}

resource "aws_cloudwatch_event_rule" "site_down" {
  count = var.enable_notifications ? 1 : 0

  name           = "${local.name_prefix}-site-down"
  description    = "Matches SiteStatusChanged events where a site just transitioned to down"
  event_bus_name = aws_cloudwatch_event_bus.site_events[0].name

  # Deliberately does NOT constrain previous_status: writeSiteStatus treats a
  # site's first check as a transition (previousStatus === undefined), so a
  # newly added site that's already down must still alert. See
  # lambda/pinger/lib/sites.js::writeSiteStatus.
  event_pattern = jsonencode({
    source        = ["pulsemonitor.pinger"]
    "detail-type" = ["SiteStatusChanged"]
    detail = {
      status = ["down"]
    }
  })

  tags = { Name = "${local.name_prefix}-site-down" }
}

resource "aws_cloudwatch_event_rule" "site_recovered" {
  count = var.enable_notifications ? 1 : 0

  name           = "${local.name_prefix}-site-recovered"
  description    = "Matches SiteStatusChanged events where a site recovered from a prior down status"
  event_bus_name = aws_cloudwatch_event_bus.site_events[0].name

  # Requiring previous_status == "down" (rather than omitting the key) is
  # what stops a brand-new site's first, successful check from generating a
  # bogus "recovered" email - EventBridge does not match JSON null against
  # the literal string "down".
  event_pattern = jsonencode({
    source        = ["pulsemonitor.pinger"]
    "detail-type" = ["SiteStatusChanged"]
    detail = {
      status          = ["up"]
      previous_status = ["down"]
    }
  })

  tags = { Name = "${local.name_prefix}-site-recovered" }
}

resource "aws_cloudwatch_event_target" "site_down" {
  count = var.enable_notifications ? 1 : 0

  rule           = aws_cloudwatch_event_rule.site_down[0].name
  event_bus_name = aws_cloudwatch_event_bus.site_events[0].name
  target_id      = "notifier"
  arn            = aws_lambda_function.notifier[0].arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 300
  }

  dead_letter_config {
    arn = aws_sqs_queue.notifier_dlq[0].arn
  }

  # PutTargets validates that events.amazonaws.com can already write to the
  # dead-letter queue, and the implicit graph edge above is only to the
  # queue's ARN - not to its policy. Without this, Terraform can legally
  # create the target before the queue policy and the apply fails with
  # "The dead letter queue policy does not allow ...".
  depends_on = [aws_sqs_queue_policy.notifier_dlq]
}

resource "aws_cloudwatch_event_target" "site_recovered" {
  count = var.enable_notifications ? 1 : 0

  rule           = aws_cloudwatch_event_rule.site_recovered[0].name
  event_bus_name = aws_cloudwatch_event_bus.site_events[0].name
  target_id      = "notifier"
  arn            = aws_lambda_function.notifier[0].arn

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 300
  }

  dead_letter_config {
    arn = aws_sqs_queue.notifier_dlq[0].arn
  }

  depends_on = [aws_sqs_queue_policy.notifier_dlq]
}

resource "aws_lambda_permission" "allow_eventbridge_notifier" {
  for_each = var.enable_notifications ? {
    down      = aws_cloudwatch_event_rule.site_down[0].arn
    recovered = aws_cloudwatch_event_rule.site_recovered[0].arn
  } : {}

  statement_id  = "AllowExecutionFromEventBridge${title(each.key)}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifier[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = each.value
}

# Either a domain identity (Easy DKIM: 3 CNAMEs published by hand at the
# registrar - see the ses_dkim_tokens output, no human click-through, any
# From address at the domain) or a single email-address identity (zero DNS
# work, one click-through on the mail SES sends to the address itself, and
# the From address must be exactly this address). Selected by
# var.notification_sender_identity_type; see local.sender_identity.
resource "aws_sesv2_email_identity" "sender" {
  count = var.enable_notifications ? 1 : 0

  email_identity         = local.sender_identity
  configuration_set_name = aws_sesv2_configuration_set.notifications[0].configuration_set_name

  tags = { Name = "${local.name_prefix}-notification-sender" }
}

# Sandbox testing only: each of these needs a manual click-through on the
# verification email AWS sends to the address itself.
resource "aws_sesv2_email_identity" "verified_recipients" {
  for_each = var.enable_notifications ? toset(var.notification_verified_recipients) : toset([])

  email_identity = each.value

  tags = { Name = "${local.name_prefix}-notification-recipient" }

  # Guards a real ordering hazard, not a hypothetical one: switching
  # notification_sender_identity_type from "email" to "domain" changes
  # aws_sesv2_email_identity.sender's email_identity argument, forcing a
  # replace (destroy the old address's identity, create the new domain
  # identity). If that old sender address is ALSO added here as a verified
  # recipient in the same apply - exactly what happens when you keep using it
  # via notification_override_recipient after the switch - this resource and
  # sender's replace have no reference-based edge between them, so Terraform
  # could run this address's CreateEmailIdentity in parallel with (or before)
  # sender's DeleteEmailIdentity for that same address, racing SES's
  # per-address uniqueness. depends_on forces sender's full destroy+create to
  # finish first.
  depends_on = [aws_sesv2_email_identity.sender]
}

resource "aws_sesv2_configuration_set" "notifications" {
  count = var.enable_notifications ? 1 : 0

  configuration_set_name = "${local.name_prefix}-notifications"

  reputation_options {
    reputation_metrics_enabled = true
  }
}

# CloudWatch-only for now: SuppressionAttributes.SuppressedReasons is already
# enabled account-wide, so AWS already blocks repeat sends to hard-bounced
# addresses with zero code here. An SNS destination + bounce-processing
# consumer is deferred as real scope creep, not an oversight.
resource "aws_sesv2_configuration_set_event_destination" "cloudwatch" {
  count = var.enable_notifications ? 1 : 0

  configuration_set_name = aws_sesv2_configuration_set.notifications[0].configuration_set_name
  event_destination_name = "${local.name_prefix}-cloudwatch"

  event_destination {
    enabled              = true
    matching_event_types = ["SEND", "DELIVERY", "BOUNCE", "COMPLAINT", "REJECT"]

    cloud_watch_destination {
      dimension_configuration {
        dimension_name          = "notification-environment"
        dimension_value_source  = "MESSAGE_TAG"
        default_dimension_value = var.environment
      }
    }
  }
}
