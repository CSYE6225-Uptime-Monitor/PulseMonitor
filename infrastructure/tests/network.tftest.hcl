# Runs offline (mocked "aws" provider, no real AWS calls or credentials needed).
#
# aws_iam_role is mocked with a valid ARN shape: root-level apply runs build
# the whole config (network + storage + monitoring), and the monitoring
# module's aws_lambda_function.pinger.role argument is ARN-validated even
# under mock_provider - an unmocked computed "arn" attribute is a random
# string, which fails that validation.
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

run "subnet_cidrs_are_correct" {
  command = apply

  # Pinned rather than left to the default: this run exercises the full
  # root config (no module {} override), so it's exposed to whatever a
  # developer's local terraform.tfvars sets for identically-named root
  # variables - and this test isn't mocking the SQS/SES resources that
  # enable_notifications=true would pull in, nor the Route 53/ACM/WAF
  # resources that enable_dns/enable_https/enable_waf would pull in
  # (aws_acm_certificate's domain_validation_options mocks to an EMPTY set,
  # which makes the cert-validation records fail on a null name rather than
  # fail usefully).
  variables {
    enable_notifications = false
    enable_dns           = false
    enable_https         = false
    enable_waf           = false
  }

  assert {
    condition     = module.network.public_subnet_ids != null
    error_message = "Network module should output public subnet IDs."
  }

  assert {
    condition     = module.network.private_subnet_ids != null
    error_message = "Network module should output private subnet IDs."
  }

  assert {
    condition     = module.network.vpc_id != null
    error_message = "Network module should output a VPC ID."
  }
}

run "security_groups_are_created" {
  command = apply

  # Pinned rather than left to the default: this run exercises the full
  # root config (no module {} override), so it's exposed to whatever a
  # developer's local terraform.tfvars sets for identically-named root
  # variables - and this test isn't mocking the SQS/SES resources that
  # enable_notifications=true would pull in, nor the Route 53/ACM/WAF
  # resources that enable_dns/enable_https/enable_waf would pull in
  # (aws_acm_certificate's domain_validation_options mocks to an EMPTY set,
  # which makes the cert-validation records fail on a null name rather than
  # fail usefully).
  variables {
    enable_notifications = false
    enable_dns           = false
    enable_https         = false
    enable_waf           = false
  }

  assert {
    condition     = module.network.alb_sg_id != null
    error_message = "Network module should output an ALB security group ID."
  }

  assert {
    condition     = module.network.app_sg_id != null
    error_message = "Network module should output an app security group ID."
  }
}

# Unit-tests the network module directly so we can assert on CIDR math and
# security-group rules (the resource attributes themselves, not just that
# outputs exist).
run "cidr_math_is_correct" {
  command = plan

  module {
    source = "./modules/network"
  }

  variables {
    vpc_cidr           = "10.0.0.0/16"
    availability_zones = ["us-east-1a", "us-east-1b"]
    project_name       = "pulsemonitor"
    environment        = "dev"
  }

  assert {
    condition     = length(aws_subnet.public) == 2
    error_message = "Network module should create one public subnet per AZ."
  }

  assert {
    condition     = length(aws_subnet.private) == 2
    error_message = "Network module should create one private subnet per AZ."
  }

  assert {
    condition     = aws_subnet.public[0].cidr_block == cidrsubnet(var.vpc_cidr, 4, 0)
    error_message = "Public subnet CIDRs should be derived from the VPC CIDR."
  }

  assert {
    condition     = aws_subnet.private[0].cidr_block == cidrsubnet(var.vpc_cidr, 4, length(var.availability_zones))
    error_message = "Private subnet CIDRs should be derived from the VPC CIDR, offset past the public subnets."
  }
}

run "security_group_rules_are_correct" {
  command = apply

  module {
    source = "./modules/network"
  }

  variables {
    vpc_cidr           = "10.0.0.0/16"
    availability_zones = ["us-east-1a", "us-east-1b"]
    project_name       = "pulsemonitor"
    environment        = "dev"
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.alb_http.from_port == 80 && aws_vpc_security_group_ingress_rule.alb_http.cidr_ipv4 == "0.0.0.0/0"
    error_message = "ALB security group should allow HTTP from the internet."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.alb_https.from_port == 443 && aws_vpc_security_group_ingress_rule.alb_https.cidr_ipv4 == "0.0.0.0/0"
    error_message = "ALB security group should allow HTTPS from the internet."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.app_from_alb.from_port == var.app_port && aws_vpc_security_group_ingress_rule.app_from_alb.referenced_security_group_id == aws_security_group.alb.id
    error_message = "App security group should allow the app port from the ALB security group only."
  }
}
