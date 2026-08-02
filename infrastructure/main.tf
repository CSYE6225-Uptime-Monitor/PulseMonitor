# PulseMonitor root module.
#
# This init sprint establishes structure only — no resources are provisioned yet.
# Module wiring below is COMMENTED and uncommented layer by layer in later sprints,
# following the dependency order: network -> compute / storage -> monitoring -> dns.
# See ./modules/* for the per-layer scaffolds and README.md for the roadmap.

module "network" {
  source             = "./modules/network"
  vpc_cidr           = var.vpc_cidr
  availability_zones = var.availability_zones
  project_name       = var.project_name
  environment        = var.environment
}

module "storage" {
  source                            = "./modules/storage"
  project_name                      = var.project_name
  environment                       = var.environment
  monitoring_history_retention_days = var.monitoring_history_retention_days
  bucket_force_destroy              = var.bucket_force_destroy
}

module "monitoring" {
  source                        = "./modules/monitoring"
  project_name                  = var.project_name
  environment                   = var.environment
  sites_table_name              = module.storage.sites_table_name
  sites_table_arn               = module.storage.sites_table_arn
  monitoring_history_bucket     = module.storage.monitoring_history_bucket_name
  monitoring_history_bucket_arn = module.storage.monitoring_history_bucket_arn
  history_prefix                = var.history_prefix
  ping_schedule                 = var.ping_schedule
  enable_alerts                 = var.enable_alerts
  alert_email                   = var.alert_email
}

module "compute" {
  source               = "./modules/compute"
  project_name         = var.project_name
  environment          = var.environment
  aws_region           = var.aws_region
  vpc_id               = module.network.vpc_id
  public_subnet_ids    = module.network.public_subnet_ids
  private_subnet_ids   = module.network.private_subnet_ids
  alb_sg_id            = module.network.alb_sg_id
  app_sg_id            = module.network.app_sg_id
  instance_type        = var.instance_type
  ami_id               = var.ami_id
  asg_min_size         = var.asg_min_size
  asg_max_size         = var.asg_max_size
  asg_desired_capacity = var.asg_desired_capacity
  certificate_arn      = var.certificate_arn

  users_table_name               = module.storage.users_table_name
  users_table_arn                = module.storage.users_table_arn
  sites_table_name               = module.storage.sites_table_name
  sites_table_arn                = module.storage.sites_table_arn
  user_data_bucket_name          = module.storage.user_data_bucket_name
  user_data_bucket_arn           = module.storage.user_data_bucket_arn
  audit_logs_bucket_arn          = module.storage.audit_logs_bucket_arn
  monitoring_history_bucket_name = module.storage.monitoring_history_bucket_name
  monitoring_history_bucket_arn  = module.storage.monitoring_history_bucket_arn
  history_prefix                 = var.history_prefix
}

# module "dns" {
#   source       = "./modules/dns"
#   domain_name  = var.domain_name
#   alb_dns_name = module.compute.alb_dns_name
#   alb_zone_id  = module.compute.alb_zone_id
#   alb_arn      = module.compute.alb_arn
# }
#
# Note: never add depends_on = [module.dns] to module "compute". The cert <->
# ALB relationship is acyclic at the resource level (aws_lb doesn't depend on
# its listener), but a module-level depends_on here would turn it into a hard
# cycle once module "dns" is uncommented.
