# PulseMonitor Infrastructure

Terraform for the PulseMonitor AWS deployment (region `us-east-1`, domain
`pulsemonitor.online`).

> **Status: init sprint — scaffolding only.** Structure and tooling are in place;
> no AWS resources are provisioned yet. Each `modules/*` folder is a stub filled in
> in later sprints.

## Layout

```
infrastructure/
├── versions.tf / providers.tf / variables.tf / outputs.tf / main.tf
├── backend.tf                 # S3 backend (commented until bootstrap is applied)
├── backend.hcl.example        # partial backend config to copy -> backend.hcl
├── terraform.tfvars.example   # copy -> terraform.tfvars
├── bootstrap/                 # one-time S3 + DynamoDB remote-state store
├── modules/                   # network, compute, storage, monitoring, dns (stubs)
└── tests/                     # terraform test + structure check
```

Module dependency order: `network → compute / storage → monitoring → dns`.

## Prerequisites

- Terraform >= 1.5 (developed on 1.15.8)
- AWS credentials (only needed once you actually apply — not for validate/test)

## Everyday commands

```bash
cd infrastructure
terraform fmt -recursive          # format
terraform init -backend=false     # load providers (no backend)
terraform validate                # check configuration
terraform test                    # run tests/*.tftest.hcl
bash tests/structure.sh           # module scaffolding check
```

## Enabling remote state (future sprint)

Remote state is written but **not applied** yet. When ready:

```bash
# 1. Create the state bucket + lock table (edit state_bucket_name first — must be globally unique)
cd infrastructure/bootstrap
terraform init && terraform apply

# 2. Wire the root module to the S3 backend
cd ..
cp backend.hcl.example backend.hcl      # fill in bootstrap outputs
#   then uncomment the backend block in backend.tf
terraform init -backend-config=backend.hcl
```

## CI

`.github/workflows/terraform.yml` runs fmt-check, the structure check, and
`validate` + `test` for both the root and bootstrap on every PR. No plan/apply,
no cloud credentials.
