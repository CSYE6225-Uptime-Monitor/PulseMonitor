terraform {
  backend "s3" {
    key     = "pulsemonitor/root/terraform.tfstate"
    encrypt = true
  }
}
