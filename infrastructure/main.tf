# PulseMonitor root module.
#
# This init sprint establishes structure only — no resources are provisioned yet.
# Module wiring below is COMMENTED and uncommented layer by layer in later sprints,
# following the dependency order: network -> compute / storage -> monitoring -> dns.
# See ./modules/* for the per-layer scaffolds and README.md for the roadmap.

# module "network" {
#   source             = "./modules/network"
#   vpc_cidr           = var.vpc_cidr
#   availability_zones = var.availability_zones
#   project_name       = var.project_name
#   environment        = var.environment
# }

# module "storage" {
#   source       = "./modules/storage"
#   project_name = var.project_name
#   environment  = var.environment
# }

# module "compute" {
#   source             = "./modules/compute"
#   vpc_id             = module.network.vpc_id
#   public_subnet_ids  = module.network.public_subnet_ids
#   private_subnet_ids = module.network.private_subnet_ids
#   alb_sg_id          = module.network.alb_sg_id
#   app_sg_id          = module.network.app_sg_id
# }

# module "monitoring" {
#   source                     = "./modules/monitoring"
#   sites_table_name           = module.storage.sites_table_name
#   monitoring_history_bucket  = module.storage.monitoring_history_bucket
# }

# module "dns" {
#   source       = "./modules/dns"
#   domain_name  = var.domain_name
#   alb_dns_name = module.compute.alb_dns_name
#   alb_zone_id  = module.compute.alb_zone_id
# }
