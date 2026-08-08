# TDD: verifies the root module's input-variable contracts.
# Runs fully offline (mocked "aws" provider, no real AWS calls or credentials
# needed) - the root module now wires in compute, whose resources reference
# each other's computed ARNs and whose data.aws_ami lookup would otherwise hit
# real AWS using whatever ambient credentials happen to be on the machine.
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

run "defaults_are_valid" {
  command = plan

  # Pinned rather than left to the default: this run exercises the full root
  # config with no overrides, so it's exposed to whatever a developer's local
  # terraform.tfvars sets for these names - and this file isn't mocking the
  # Route 53/ACM/WAF resources that enable_dns/enable_https/enable_waf would
  # pull in (aws_acm_certificate's domain_validation_options mocks to an
  # EMPTY set, which makes the cert-validation records fail on a null name
  # rather than fail usefully).
  variables {
    enable_notifications = false
    enable_dns           = false
    enable_https         = false
    enable_waf           = false
  }

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

  # See the comment on defaults_are_valid above - an expect_failures run is
  # doubly sensitive to this: an unexpected error appearing alongside the
  # expected one fails the run.
  variables {
    environment          = "production"
    enable_notifications = false
    enable_dns           = false
    enable_https         = false
    enable_waf           = false
  }

  expect_failures = [
    var.environment,
  ]
}

run "rejects_bad_cidr" {
  command = plan

  variables {
    vpc_cidr             = "not-a-cidr"
    enable_notifications = false
    enable_dns           = false
    enable_https         = false
    enable_waf           = false
  }

  expect_failures = [
    var.vpc_cidr,
  ]
}
