# TDD: verifies the compute module's ALB, target group, listeners, launch
# template, ASG, and least-privilege IAM. Runs offline (mocked "aws" provider).

mock_provider "aws" {
  mock_resource "aws_iam_role" {
    defaults = {
      arn = "arn:aws:iam::123456789012:role/mock-role"
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

variables {
  project_name       = "pulsemonitor"
  environment        = "dev"
  aws_region         = "us-east-1"
  vpc_id             = "vpc-0123456789abcdef0"
  public_subnet_ids  = ["subnet-aaaaaaaa", "subnet-bbbbbbbb"]
  private_subnet_ids = ["subnet-cccccccc", "subnet-dddddddd"]
  alb_sg_id          = "sg-0111111111111111"
  app_sg_id          = "sg-0222222222222222"
  ami_id             = "ami-0123456789abcdef0"

  users_table_name               = "pulsemonitor-dev-users"
  users_table_arn                = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-users"
  sites_table_name               = "pulsemonitor-dev-sites"
  sites_table_arn                = "arn:aws:dynamodb:us-east-1:123456789012:table/pulsemonitor-dev-sites"
  user_data_bucket_name          = "pulsemonitor-dev-user-data-123456789012"
  user_data_bucket_arn           = "arn:aws:s3:::pulsemonitor-dev-user-data-123456789012"
  audit_logs_bucket_arn          = "arn:aws:s3:::pulsemonitor-dev-audit-logs-123456789012"
  monitoring_history_bucket_name = "pulsemonitor-dev-monitoring-history-123456789012"
  monitoring_history_bucket_arn  = "arn:aws:s3:::pulsemonitor-dev-monitoring-history-123456789012"
}

run "compute_outputs_are_exposed" {
  command = apply

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = output.alb_dns_name != null
    error_message = "Compute module should output the ALB DNS name."
  }

  assert {
    condition     = output.asg_name != null
    error_message = "Compute module should output the ASG name."
  }

  assert {
    condition     = output.instance_role_arn != null
    error_message = "Compute module should output the instance role ARN."
  }
}

run "alb_is_internet_facing_across_both_subnets" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_lb.this.internal == false
    error_message = "ALB must be internet-facing."
  }

  assert {
    condition     = aws_lb.this.load_balancer_type == "application"
    error_message = "ALB must be an application load balancer."
  }

  assert {
    condition     = length(aws_lb.this.subnets) == 2
    error_message = "ALB should span both public subnets."
  }

  assert {
    condition     = aws_lb.this.drop_invalid_header_fields == true
    error_message = "ALB should drop invalid header fields."
  }
}

run "target_group_health_check_hits_healthz" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_lb_target_group.app.health_check[0].path == "/healthz"
    error_message = "Target group health check must probe /healthz."
  }

  assert {
    condition     = aws_lb_target_group.app.health_check[0].matcher == "200"
    error_message = "Target group health check must expect HTTP 200."
  }

  assert {
    condition     = aws_lb_target_group.app.port == 80
    error_message = "Target group should forward to port 80 (nginx), not 8080 (Express)."
  }

  assert {
    condition     = aws_lb_target_group.app.target_type == "instance"
    error_message = "Target group target_type must be instance."
  }
}

run "listener_is_http_only_without_a_certificate" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_lb_listener.http.port == 80
    error_message = "HTTP listener should be on port 80."
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].type == "forward"
    error_message = "HTTP listener should forward directly when no certificate is configured."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 0
    error_message = "HTTPS listener should not exist when certificate_arn is null."
  }
}

run "listener_redirects_to_https_when_certificate_present" {
  command = plan

  module {
    source = "./modules/compute"
  }

  variables {
    certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc-123"
  }

  assert {
    condition     = aws_lb_listener.http.default_action[0].type == "redirect"
    error_message = "HTTP listener should redirect to HTTPS once a certificate is configured."
  }

  assert {
    condition     = length(aws_lb_listener.https) == 1
    error_message = "HTTPS listener should exist once certificate_arn is set."
  }

  assert {
    condition     = aws_lb_listener.https[0].port == 443
    error_message = "HTTPS listener should be on port 443."
  }
}

run "launch_template_is_hardened" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_launch_template.app.metadata_options[0].http_tokens == "required"
    error_message = "Launch template must require IMDSv2."
  }

  assert {
    condition     = aws_launch_template.app.metadata_options[0].http_put_response_hop_limit == 1
    error_message = "IMDS hop limit should be 1."
  }

  assert {
    # tostring(): under mock_provider, a nested block with any computed sibling
    # attribute (snapshot_id, iops, throughput are all Optional+Computed on
    # aws_ebs_block_device) gets its whole block mock-generated as strings,
    # even for fields explicitly set to a literal in configuration.
    condition     = tostring(aws_launch_template.app.block_device_mappings[0].ebs[0].encrypted) == "true"
    error_message = "Root volume must be encrypted."
  }

  assert {
    condition     = aws_launch_template.app.key_name == null
    error_message = "Launch template must not configure an SSH key."
  }

  assert {
    condition     = aws_launch_template.app.user_data != null
    error_message = "Launch template must configure user_data."
  }

  assert {
    condition     = aws_launch_template.app.update_default_version == true
    error_message = "Launch template should update its default version on change."
  }
}

run "asg_spans_both_private_subnets" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_autoscaling_group.app.min_size == 2
    error_message = "ASG min_size should default to 2 (one per AZ)."
  }

  assert {
    condition     = aws_autoscaling_group.app.desired_capacity == 2
    error_message = "ASG desired_capacity should default to 2."
  }

  assert {
    condition     = length(aws_autoscaling_group.app.vpc_zone_identifier) == 2
    error_message = "ASG should span both private subnets."
  }

  assert {
    condition     = aws_autoscaling_group.app.health_check_type == "ELB"
    error_message = "ASG health check type must be ELB, not EC2, so a wedged process gets replaced."
  }

  assert {
    condition     = aws_autoscaling_group.app.health_check_grace_period == 300
    error_message = "ASG health check grace period should be 300s."
  }
}

run "instance_refresh_is_configured_with_a_concrete_version" {
  command = plan

  module {
    source = "./modules/compute"
  }

  assert {
    condition     = aws_autoscaling_group.app.instance_refresh[0].strategy == "Rolling"
    error_message = "Instance refresh strategy must be Rolling."
  }

  assert {
    condition     = aws_autoscaling_group.app.instance_refresh[0].preferences[0].min_healthy_percentage == 50
    error_message = "Instance refresh min_healthy_percentage should be 50."
  }

  assert {
    condition     = aws_autoscaling_group.app.instance_refresh[0].preferences[0].auto_rollback == true
    error_message = "Instance refresh should auto-rollback on failure."
  }

  assert {
    condition     = aws_autoscaling_group.app.launch_template[0].version != "$Latest"
    error_message = "ASG must reference a concrete launch template version, or instance refresh silently never fires."
  }
}

run "iam_is_least_privilege" {
  # apply (not plan): the S3/logs policies embed aws_cloudwatch_log_group.app.arn
  # and aws_ssm_parameter.session_secret.arn, computed attributes of other
  # resources in this same plan, unresolved until apply under mock_provider.
  command = apply

  module {
    source = "./modules/compute"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.dynamodb.policy).Statement :
      contains(s.Action, "dynamodb:DescribeTable")
    ])
    error_message = "Instance role must allow dynamodb:DescribeTable - /healthz depends on it."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.dynamodb.policy).Statement :
      s if contains(s.Action, "dynamodb:Scan")
    ]) == 0
    error_message = "Instance role must not allow dynamodb:Scan - the API never scans."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_role_policy.s3.policy).Statement :
      s if contains(s.Resource, "*")
    ]) == 0
    error_message = "No S3 statement should use a wildcard resource."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.s3.policy).Statement :
      s.Sid == "AuditLogsAppendOnly" && s.Action == ["s3:PutObject"]
    ])
    error_message = "Audit-logs bucket access must be append-only (PutObject only)."
  }
}

run "rejects_asg_min_size_below_two" {
  command = plan

  module {
    source = "./modules/compute"
  }

  variables {
    asg_min_size = 1
  }

  expect_failures = [var.asg_min_size]
}
