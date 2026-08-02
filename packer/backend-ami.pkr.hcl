packer {
  required_plugins {
    amazon = {
      source  = "github.com/hashicorp/amazon"
      version = "~> 1"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "instance_type" {
  type    = string
  default = "t3.micro"
}

# Bakes the backend Express app + nginx into an AMI so instances boot without
# any GitHub/npm-registry dependency - user-data only needs to fetch the
# session secret from SSM and start the already-installed systemd units.
source "amazon-ebs" "backend" {
  region        = var.aws_region
  instance_type = var.instance_type
  ssh_username  = "ec2-user"

  source_ami_filter {
    filters = {
      name                = "al2023-ami-*-x86_64"
      virtualization-type = "hvm"
      root-device-type    = "ebs"
    }
    owners      = ["amazon"]
    most_recent = true
  }

  ami_name = "pulsemonitor-backend-{{timestamp}}"
  tags = {
    Name        = "pulsemonitor-backend"
    Application = "pulsemonitor-backend"
    ManagedBy   = "Packer"
  }
}

build {
  sources = ["source.amazon-ebs.backend"]

  provisioner "shell" {
    inline = [
      "sudo dnf install -y nginx nodejs20",
      "sudo useradd -r -s /sbin/nologin pulsemonitor || true",
      "sudo install -d -o pulsemonitor -g pulsemonitor /opt/pulsemonitor",
      "sudo install -d -m 0750 -o root -g pulsemonitor /etc/pulsemonitor",
    ]
  }

  # Built with `npm ci --omit=dev` in backend/ before running `packer build`,
  # so node_modules is already production-only when it lands on the AMI.
  provisioner "file" {
    source      = "../backend/"
    destination = "/tmp/pulsemonitor-backend"
  }

  provisioner "shell" {
    inline = [
      "sudo rm -rf /opt/pulsemonitor/*",
      "sudo cp -r /tmp/pulsemonitor-backend/. /opt/pulsemonitor/",
      "sudo rm -rf /opt/pulsemonitor/.env /opt/pulsemonitor/tests /opt/pulsemonitor/coverage",
      "sudo chown -R pulsemonitor:pulsemonitor /opt/pulsemonitor",
    ]
  }

  provisioner "file" {
    source      = "files/nginx.conf"
    destination = "/tmp/nginx.conf"
  }

  provisioner "file" {
    source      = "files/pulsemonitor.service"
    destination = "/tmp/pulsemonitor.service"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf",
      "sudo mv /tmp/pulsemonitor.service /etc/systemd/system/pulsemonitor.service",
      "sudo systemctl daemon-reload",
      # enable, not start: both units need the /etc/pulsemonitor/app.env file
      # that user-data writes at boot (SESSION_SECRET, table names, etc).
      "sudo systemctl enable nginx pulsemonitor",
    ]
  }
}
