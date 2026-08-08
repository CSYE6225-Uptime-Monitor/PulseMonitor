# Module: compute
# Responsibility: the internet-facing app tier behind the ALB.
#
# Port chain: ALB (80/443, public) -> target group (alb_target_port, 80) ->
# EC2 instance nginx:80 -> proxy_pass -> Express on 127.0.0.1:8080. The app
# ships as a Packer-baked AMI (see packer/backend-ami.pkr.hcl); user-data only
# writes the runtime environment file (pulling SESSION_SECRET from SSM) and
# starts the already-installed systemd units - no GitHub/npm-registry
# dependency at boot.

locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

data "aws_ami" "app" {
  count       = var.ami_id == null ? 1 : 0
  most_recent = true
  owners      = ["self"]

  filter {
    name   = "tag:Application"
    values = ["pulsemonitor-backend"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

# --- Secrets -----------------------------------------------------------

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_ssm_parameter" "session_secret" {
  name  = "/${var.project_name}/${var.environment}/session_secret"
  type  = "SecureString"
  value = random_password.session_secret.result

  lifecycle {
    ignore_changes = [value]
  }

  tags = { Name = "${local.name_prefix}-session-secret" }
}

# --- Logging -------------------------------------------------------------

resource "aws_cloudwatch_log_group" "app" {
  name              = "/${var.project_name}/${var.environment}/app"
  retention_in_days = var.log_retention_days

  tags = { Name = "${local.name_prefix}-app-logs" }
}

# --- IAM -------------------------------------------------------------------
# Written with jsonencode() rather than data.aws_iam_policy_document: under
# mock_provider "aws" {} that data source returns generated placeholder JSON,
# which makes any test assertion on policy content meaningless.

resource "aws_iam_role" "instance" {
  name = "${local.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "EC2AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = { Name = "${local.name_prefix}-ec2-role" }
}

resource "aws_iam_instance_profile" "instance" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.instance.name
}

# DescribeTable is required: backend/src/routes/health.js's /healthz calls
# DescribeTableCommand - without it every target flaps unhealthy forever.
# No Scan: the API never scans; the pinger (modules/monitoring) has its own role.
resource "aws_iam_role_policy" "dynamodb" {
  name = "${local.name_prefix}-ec2-dynamodb-policy"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AppTableAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:BatchGetItem",
          "dynamodb:DescribeTable",
        ]
        Resource = [
          var.users_table_arn,
          var.sites_table_arn,
          "${var.sites_table_arn}/index/*",
        ]
      },
    ]
  })
}

resource "aws_iam_role_policy" "s3" {
  name = "${local.name_prefix}-ec2-s3-policy"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ListAppBuckets"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.user_data_bucket_arn, var.audit_logs_bucket_arn, var.monitoring_history_bucket_arn]
      },
      {
        Sid      = "UserDataReadWrite"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${var.user_data_bucket_arn}/*"]
      },
      {
        Sid      = "MonitoringHistoryRead"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${var.monitoring_history_bucket_arn}/*"]
      },
      {
        # No Delete: objects are immutable once written; Get is required by
        # GET /v1/user/self/activity.
        Sid      = "AuditLogsWriteAndRead"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = ["${var.audit_logs_bucket_arn}/*"]
      },
    ]
  })
}

resource "aws_iam_role_policy" "logs" {
  name = "${local.name_prefix}-ec2-logs-policy"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "WriteAppLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
        Resource = [aws_cloudwatch_log_group.app.arn, "${aws_cloudwatch_log_group.app.arn}:*"]
      },
      {
        # CloudWatch agent dimension lookup - the only intentional wildcard
        # here; ec2:DescribeTags has no resource-level support.
        Sid      = "DescribeOwnTags"
        Effect   = "Allow"
        Action   = ["ec2:DescribeTags"]
        Resource = ["*"]
      },
    ]
  })
}

resource "aws_iam_role_policy" "ssm_params" {
  name = "${local.name_prefix}-ec2-ssm-policy"
  role = aws_iam_role.instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadSessionSecret"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = [aws_ssm_parameter.session_secret.arn]
      },
      {
        # SecureString above uses the default aws/ssm key, whose key policy
        # can't be edited - so decrypt access is granted here via IAM instead.
        Sid      = "DecryptSessionSecret"
        Effect   = "Allow"
        Action   = ["kms:Decrypt"]
        Resource = ["arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/ssm"]
      },
    ]
  })
}

# Replaces SSH: with no key_name and no port-22 ingress rule, this is what
# lets "no SSH from internet" be structural rather than just firewalled.
resource "aws_iam_role_policy_attachment" "ssm_core" {
  count      = var.enable_session_manager ? 1 : 0
  role       = aws_iam_role.instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# --- Load balancer -----------------------------------------------------

resource "aws_lb" "this" {
  name                       = "${local.name_prefix}-alb"
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [var.alb_sg_id]
  subnets                    = var.public_subnet_ids
  drop_invalid_header_fields = true
  idle_timeout               = 60
  enable_deletion_protection = var.environment == "prod"

  tags = { Name = "${local.name_prefix}-alb" }
}

resource "aws_lb_target_group" "app" {
  name_prefix = "pm-tg-"
  port        = var.alb_target_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "instance"

  deregistration_delay = 30

  health_check {
    enabled             = true
    path                = "/healthz"
    port                = "traffic-port"
    protocol            = "HTTP"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${local.name_prefix}-tg" }
}

# HTTP listener: forwards directly while certificate_arn is null (today),
# and redirects to HTTPS once a cert is wired in from the dns module -
# a one-variable change, not a restructure.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.app.arn
    }
  }

  dynamic "default_action" {
    for_each = var.certificate_arn == null ? [] : [1]
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count             = var.certificate_arn == null ? 0 : 1
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = var.ssl_policy
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# --- Launch template + ASG ----------------------------------------------

resource "aws_launch_template" "app" {
  name_prefix            = "${local.name_prefix}-lt-"
  update_default_version = true
  image_id               = coalesce(var.ami_id, one(data.aws_ami.app[*].id))
  instance_type          = var.instance_type

  iam_instance_profile {
    arn = aws_iam_instance_profile.instance.arn
  }

  vpc_security_group_ids = [var.app_sg_id]

  # No key_name: combined with the app SG (no port 22 ingress), this makes
  # "no SSH from internet" structural. Use SSM Session Manager to debug.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
    instance_metadata_tags      = "enabled"
  }

  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = 20
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }

  monitoring {
    enabled = var.detailed_monitoring
  }

  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${local.name_prefix}-app" }
  }

  tag_specifications {
    resource_type = "volume"
    tags          = { Name = "${local.name_prefix}-app" }
  }

  user_data = base64encode(templatefile("${path.module}/templates/user-data.sh.tftpl", {
    region               = var.aws_region
    users_table          = var.users_table_name
    sites_table          = var.sites_table_name
    history_bucket       = var.monitoring_history_bucket_name
    history_prefix       = var.history_prefix
    user_data_bucket     = var.user_data_bucket_name
    export_prefix        = var.export_prefix
    audit_bucket         = var.audit_logs_bucket_name
    audit_prefix         = var.audit_prefix
    app_port             = var.app_port
    node_env             = var.node_env
    cookie_secure        = var.cookie_secure
    session_secret_param = aws_ssm_parameter.session_secret.name
    log_group_name       = aws_cloudwatch_log_group.app.name
  }))

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "${local.name_prefix}-asg"
  vpc_zone_identifier = var.private_subnet_ids
  min_size            = var.asg_min_size
  max_size            = var.asg_max_size
  desired_capacity    = var.asg_desired_capacity

  health_check_type         = "ELB"
  health_check_grace_period = 300
  target_group_arns         = [aws_lb_target_group.app.arn]

  launch_template {
    id = aws_launch_template.app.id
    # Deliberately the numeric version, not "$Latest": with "$Latest" the ASG
    # never shows a diff when the launch template changes, so instance
    # refresh never fires. auto_rollback also requires a concrete version.
    version = aws_launch_template.app.latest_version
  }

  instance_refresh {
    strategy = "Rolling"
    preferences {
      min_healthy_percentage = 50
      instance_warmup        = 300
      auto_rollback          = true
    }
    # "launch_template" is omitted: referencing a concrete version above
    # already triggers a refresh on every launch template change, and the AWS
    # provider warns that including it here is a no-op.
    triggers = ["tag"]
  }

  min_elb_capacity          = var.asg_min_size
  wait_for_capacity_timeout = "10m"

  tag {
    key                 = "Name"
    value               = "${local.name_prefix}-app"
    propagate_at_launch = true
  }

  lifecycle {
    ignore_changes = [desired_capacity]
  }
}
