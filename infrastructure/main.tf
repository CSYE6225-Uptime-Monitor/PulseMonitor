# PulseMonitor root module.
#
# Module wiring follows the dependency order: network -> compute / storage ->
# monitoring -> dns. See ./modules/* for the per-layer implementations and
# README.md for data contracts and CI details.
#
# https_enabled is the single derived truth for "is HTTPS actually live",
# mirroring local.sender_identity in modules/monitoring/notifications.tf:
# encode the invariant once here rather than validating it in two places.
# module.dns.certificate_arn is already structurally null unless BOTH
# enable_dns and enable_https are true (see modules/dns/outputs.tf), so this
# local is redundant with that by construction - it exists so call sites here
# (cookie_secure, app_url) don't have to reason about the dns module's
# internals to arrive at the same answer.
locals {
  https_enabled = var.enable_dns && var.enable_https

  # Never derived from module.monitoring.ses_dkim_tokens (a computed,
  # unknown-length list at plan on the apply that first creates the SES
  # identity) - only from these two static root variables, so module.dns can
  # gate its DKIM record count on a value that's always known at plan.
  ses_dkim_enabled = var.enable_notifications && var.notification_sender_identity_type == "domain"
}

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
  raw_ping_prefix                   = "${var.history_prefix}/"
}

module "monitoring" {
  source                        = "./modules/monitoring"
  project_name                  = var.project_name
  environment                   = var.environment
  sites_table_name              = module.storage.sites_table_name
  sites_table_arn               = module.storage.sites_table_arn
  users_table_name              = module.storage.users_table_name
  users_table_arn               = module.storage.users_table_arn
  users_user_id_index_arn       = module.storage.users_user_id_index_arn
  monitoring_history_bucket     = module.storage.monitoring_history_bucket_name
  monitoring_history_bucket_arn = module.storage.monitoring_history_bucket_arn
  history_prefix                = var.history_prefix
  ping_schedule                 = var.ping_schedule
  enable_alerts                 = var.enable_alerts
  alert_email                   = var.alert_email

  enable_notifications              = var.enable_notifications
  notification_sender_identity_type = var.notification_sender_identity_type
  notification_sender_domain        = var.notification_sender_domain
  notification_sender_email         = var.notification_sender_email
  notification_override_recipient   = var.notification_override_recipient
  notification_verified_recipients  = var.notification_verified_recipients
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
  certificate_arn      = module.dns.certificate_arn
  enable_https         = local.https_enabled
  cookie_secure        = local.https_enabled

  users_table_name               = module.storage.users_table_name
  users_table_arn                = module.storage.users_table_arn
  sites_table_name               = module.storage.sites_table_name
  sites_table_arn                = module.storage.sites_table_arn
  user_data_bucket_name          = module.storage.user_data_bucket_name
  user_data_bucket_arn           = module.storage.user_data_bucket_arn
  audit_logs_bucket_arn          = module.storage.audit_logs_bucket_arn
  audit_logs_bucket_name         = module.storage.audit_logs_bucket_name
  monitoring_history_bucket_name = module.storage.monitoring_history_bucket_name
  monitoring_history_bucket_arn  = module.storage.monitoring_history_bucket_arn
  history_prefix                 = var.history_prefix
}

# No count on this module block, and no count/for_each expression anywhere
# in it that reads from module.compute: every resource inside module.dns is
# individually count-gated on enable_dns/enable_https/enable_waf instead (the
# same house style as modules/monitoring/notifications.tf). A count on the
# module block itself would create a single expansion vertex that every
# resource inside it depends on - if that count expression ever read a
# module.compute output, this dns <-> compute wiring would become a genuine
# cycle instead of the two independent, acyclic chains it is today (dns reads
# the ALB's outputs; compute reads dns's certificate_arn - neither chain's
# ancestry references the other).
#
# For the same reason: never add depends_on = [module.dns] to module
# "compute", and never add depends_on = [module.compute] to module "dns"
# either - a module-level depends_on inserts an edge from every resource in
# one module to every resource in the other, which closes the loop that the
# fine-grained resource references above deliberately avoid.
module "dns" {
  source = "./modules/dns"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region

  domain_name  = var.domain_name
  alb_dns_name = module.compute.alb_dns_name
  alb_zone_id  = module.compute.alb_zone_id
  alb_arn      = module.compute.alb_arn

  enable_dns   = var.enable_dns
  enable_https = var.enable_https
  enable_waf   = var.enable_waf

  enable_ses_dkim = local.ses_dkim_enabled
  ses_dkim_tokens = module.monitoring.ses_dkim_tokens
}
