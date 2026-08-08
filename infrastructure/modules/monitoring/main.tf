# Module: monitoring
# Responsibility: the scheduled pinger and observability pipeline.
#
# Layer scope:
#   - EventBridge rule (rate: every 5 minutes) -> Pinger Lambda
#   - Pinger Lambda + least-privilege IAM role (reads sites table, writes
#     status back to the sites table, appends history to S3)
#   - CloudWatch log group for the function
#
# Deliberately NOT deployed in the VPC: the pinger only talks to DynamoDB, S3,
# CloudWatch Logs, and arbitrary public URLs - all IAM-authenticated public AWS
# endpoints, nothing private. Putting it in the VPC would add a NAT/interface-
# endpoint dependency for zero benefit, and would make a confused-deputy SSRF
# against the private app tier possible if the URL guard ever has a bug. The
# architecture diagram agrees - Monitoring sits outside the VPC boundary.
# Do not add a vpc_config block here.
#
# CloudWatch alarms + an SNS alerts topic are deferred to Sprint 4 and land as
# an additive alerts.tf; enable_alerts/alert_email are declared now so that
# diff stays isolated to a new file.

locals {
  name_prefix    = "${var.project_name}-${var.environment}"
  function_name  = "${local.name_prefix}-pinger"
  log_group_name = "/aws/lambda/${local.function_name}"
}

# node_modules is bundled (not excluded): the pinger's AWS SDK v3 packages
# are regular "dependencies" and must ship in the zip rather than resolve
# from the Lambda runtime's provided SDK, per AWS's own recommendation. Run
# `npm ci --omit=dev` in lambda/pinger/ before `terraform apply` so only
# production deps land in node_modules and thus in this zip.
data "archive_file" "pinger" {
  type        = "zip"
  source_dir  = "${path.module}/../../../lambda/pinger"
  output_path = "${path.module}/build/pinger.zip"
  excludes    = ["coverage", "tests", "package-lock.json", "*.test.js", "README.md"]
}

resource "aws_cloudwatch_log_group" "pinger" {
  name              = local.log_group_name
  retention_in_days = var.log_retention_days

  tags = { Name = local.log_group_name }
}

resource "aws_iam_role" "pinger" {
  name = "${local.name_prefix}-pinger-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "LambdaAssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-pinger-role" }
}

# Written with jsonencode() rather than data.aws_iam_policy_document: under
# mock_provider "aws" {} that data source returns generated placeholder JSON,
# which makes any test assertion on policy content meaningless. jsonencode()
# is a plain-config value known at plan time and fully assertable offline.
resource "aws_iam_role_policy" "pinger" {
  name = "${local.name_prefix}-pinger-policy"
  role = aws_iam_role.pinger.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = ["${aws_cloudwatch_log_group.pinger.arn}:*"]
      },
      {
        Sid      = "ReadSitesTable"
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = [var.sites_table_arn]
      },
      {
        Sid      = "WriteSiteStatus"
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = [var.sites_table_arn]
      },
      {
        Sid      = "AppendCheckHistory"
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = ["${var.monitoring_history_bucket_arn}/${var.history_prefix}/*"]
      },
      ], var.enable_notifications ? [
      {
        Sid      = "PublishStatusChanges"
        Effect   = "Allow"
        Action   = ["events:PutEvents"]
        Resource = [aws_cloudwatch_event_bus.site_events[0].arn]
      },
    ] : [])
  })
}

resource "aws_lambda_function" "pinger" {
  function_name = local.function_name
  role          = aws_iam_role.pinger.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]

  filename         = data.archive_file.pinger.output_path
  source_code_hash = data.archive_file.pinger.output_base64sha256

  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory_mb
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = merge(
      {
        SITES_TABLE      = var.sites_table_name
        HISTORY_BUCKET   = var.monitoring_history_bucket
        HISTORY_PREFIX   = var.history_prefix
        PING_TIMEOUT_MS  = tostring(var.ping_timeout_ms)
        MAX_CONCURRENCY  = tostring(var.max_concurrency)
        METRIC_NAMESPACE = var.metric_namespace
        ENVIRONMENT      = var.environment
        LOG_LEVEL        = var.log_level
      },
      # Absent (not empty-string) when disabled, so the pinger's own
      # readEnv() treats notifications as off and skips publishing entirely.
      var.enable_notifications ? { EVENT_BUS_NAME = aws_cloudwatch_event_bus.site_events[0].name } : {}
    )
  }

  depends_on = [aws_cloudwatch_log_group.pinger, aws_iam_role_policy.pinger]

  tags = { Name = local.function_name }
}

resource "aws_cloudwatch_event_rule" "ping_schedule" {
  name                = "${local.name_prefix}-ping-schedule"
  description         = "Invokes the PulseMonitor pinger on a fixed schedule"
  schedule_expression = var.ping_schedule
  state               = var.ping_enabled ? "ENABLED" : "DISABLED"

  tags = { Name = "${local.name_prefix}-ping-schedule" }
}

resource "aws_cloudwatch_event_target" "pinger" {
  rule      = aws_cloudwatch_event_rule.ping_schedule.name
  target_id = "pinger"
  arn       = aws_lambda_function.pinger.arn
  input     = jsonencode({ source = "schedule" })

  retry_policy {
    maximum_retry_attempts       = 2
    maximum_event_age_in_seconds = 300
  }
}

resource "aws_lambda_permission" "allow_eventbridge" {
  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.pinger.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.ping_schedule.arn
}
