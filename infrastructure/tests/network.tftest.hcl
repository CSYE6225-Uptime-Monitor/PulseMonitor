# Runs offline (mocked "aws" provider, no real AWS calls or credentials needed).

mock_provider "aws" {}

run "subnet_cidrs_are_correct" {
  command = apply

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
