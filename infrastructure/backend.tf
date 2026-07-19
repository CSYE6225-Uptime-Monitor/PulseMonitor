# S3 remote state backend for the root module.
#
# Left COMMENTED during the init sprint so the configuration validates and tests
# run offline (no bucket exists yet). Enable it AFTER applying ./bootstrap:
#
#   1. cd bootstrap && terraform init && terraform apply
#   2. copy backend.hcl.example -> backend.hcl and fill in the bootstrap outputs
#   3. uncomment the block below
#   4. terraform init -backend-config=backend.hcl
#
# terraform {
#   backend "s3" {
#     key          = "pulsemonitor/root/terraform.tfstate"
#     encrypt      = true
#     # bucket, region, dynamodb_table supplied via -backend-config=backend.hcl
#   }
# }
