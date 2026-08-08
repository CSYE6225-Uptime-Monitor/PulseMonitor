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

# Left empty lets the Amazon EBS builder auto-resolve a subnet in the
# region's default VPC (the normal case). Set explicitly only when that
# resolution fails - e.g. a default VPC whose subnets exist but aren't
# marked DefaultForAz (so "no subnet_id, no vpc_id" finds nothing):
# `packer build -var="subnet_id=subnet-xxxx" backend-ami.pkr.hcl`.
variable "subnet_id" {
  type    = string
  default = ""
}

# Bakes the backend Express app + nginx into an AMI so instances boot without
# any GitHub/npm-registry dependency - user-data only needs to fetch the
# session secret from SSM and start the already-installed systemd units.
source "amazon-ebs" "backend" {
  region        = var.aws_region
  instance_type = var.instance_type
  ssh_username  = "ec2-user"
  subnet_id     = var.subnet_id != "" ? var.subnet_id : null

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
      # nodejs22 matches the pinger Lambda's nodejs22.x runtime and satisfies
      # the frontend's Next 16 minimum (Node >=20.9).
      "sudo dnf install -y nginx nodejs22 amazon-cloudwatch-agent",
      "sudo useradd -r -s /sbin/nologin pulsemonitor || true",
      "sudo install -d -o pulsemonitor -g pulsemonitor /opt/pulsemonitor",
      "sudo install -d -o pulsemonitor -g pulsemonitor /opt/pulsemonitor-frontend",
      "sudo install -d -m 0750 -o root -g pulsemonitor /etc/pulsemonitor",
      # pulsemonitor.service writes here instead of the journal so the
      # CloudWatch agent (configured by user-data, which knows the
      # environment-specific log group name) has a file to tail.
      "sudo install -d -o pulsemonitor -g pulsemonitor /var/log/pulsemonitor",
    ]
  }

  # Packer's file provisioner transfers a directory as one SCP put per file,
  # and node_modules-heavy trees (thousands of small files) reliably trip
  # "wait: remote command exited without exit status or exit signal" on that
  # many back-to-back puts over one SSH channel. A single tarball transfer
  # sidesteps it entirely - tar preserves the relative symlinks under
  # node_modules/.bin/ the same way the old recursive copy did.
  #
  # The tarballs are built OUTSIDE Packer, by ./scripts/package-artifacts.sh,
  # rather than via a shell-local provisioner here: the file provisioner
  # validates that its source exists at config-parse time, before any
  # provisioner has run, so a shell-local step earlier in this same build
  # block cannot produce a file in time for it. CI and humans both run that
  # one script, so the AMI contents can't drift between them.
  provisioner "file" {
    source      = "build/pulsemonitor-backend.tar.gz"
    destination = "/tmp/pulsemonitor-backend.tar.gz"
  }

  # Built with `npm ci --omit=dev` in backend/ before running `packer build`,
  # so node_modules is already production-only when it lands on the AMI.
  provisioner "shell" {
    inline = [
      "mkdir -p /tmp/pulsemonitor-backend",
      "tar -xzf /tmp/pulsemonitor-backend.tar.gz -C /tmp/pulsemonitor-backend",
      "sudo rm -rf /opt/pulsemonitor/*",
      "sudo cp -r /tmp/pulsemonitor-backend/. /opt/pulsemonitor/",
      "sudo rm -rf /opt/pulsemonitor/.env /opt/pulsemonitor/tests /opt/pulsemonitor/coverage",
      "sudo chown -R pulsemonitor:pulsemonitor /opt/pulsemonitor",
    ]
  }

  # Built with `npm ci && npm run build` in frontend/ before running `packer
  # build` (produces .next/standalone/, which bundles only the frontend's
  # production deps - see frontend/next.config.ts's `output: "standalone"`).
  # standalone output doesn't copy static assets itself, so those are staged
  # into the same tarball rather than shipped as separate top-level dirs.
  provisioner "file" {
    source      = "build/pulsemonitor-frontend.tar.gz"
    destination = "/tmp/pulsemonitor-frontend.tar.gz"
  }

  provisioner "shell" {
    inline = [
      "mkdir -p /tmp/pulsemonitor-frontend",
      "tar -xzf /tmp/pulsemonitor-frontend.tar.gz -C /tmp/pulsemonitor-frontend",
      "sudo rm -rf /opt/pulsemonitor-frontend/*",
      "sudo cp -r /tmp/pulsemonitor-frontend/. /opt/pulsemonitor-frontend/",
      "sudo chown -R pulsemonitor:pulsemonitor /opt/pulsemonitor-frontend",
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

  provisioner "file" {
    source      = "files/pulsemonitor-frontend.service"
    destination = "/tmp/pulsemonitor-frontend.service"
  }

  provisioner "shell" {
    inline = [
      "sudo mv /tmp/nginx.conf /etc/nginx/nginx.conf",
      "sudo mv /tmp/pulsemonitor.service /etc/systemd/system/pulsemonitor.service",
      "sudo mv /tmp/pulsemonitor-frontend.service /etc/systemd/system/pulsemonitor-frontend.service",
      "sudo systemctl daemon-reload",
      # enable, not start: pulsemonitor.service needs the /etc/pulsemonitor/app.env
      # file that user-data writes at boot (SESSION_SECRET, table names, etc).
      # pulsemonitor-frontend.service needs no secrets, but user-data starts
      # all three units together for a single, predictable boot sequence.
      "sudo systemctl enable nginx pulsemonitor pulsemonitor-frontend",
    ]
  }
}
