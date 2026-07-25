run "subnet_cidrs_are_correct" {
  command = plan

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
  command = plan

  assert {
    condition     = module.network.alb_sg_id != null
    error_message = "Network module should output an ALB security group ID."
  }

  assert {
    condition     = module.network.app_sg_id != null
    error_message = "Network module should output an app security group ID."
  }
}