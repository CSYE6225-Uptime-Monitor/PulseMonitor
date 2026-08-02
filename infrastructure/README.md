# PulseMonitor Infrastructure

Terraform for the PulseMonitor AWS deployment (region `us-east-1`, domain
`pulsemonitor.online`).

## Module status

| Module | Status |
|---|---|
| `network` | Implemented — VPC, 2-AZ public/private subnets, IGW, NAT per AZ, ALB/app security groups |
| `storage` | Implemented — `users` + `sites` DynamoDB tables, 3 S3 buckets (user-data, audit-logs, monitoring-history) |
| `monitoring` | Implemented — pinger Lambda (`lambda/pinger/`), EventBridge 5-minute schedule, least-privilege IAM, CloudWatch log group |
| `compute` | Implemented — ALB, target group, HTTP/HTTPS-ready listeners, launch template (Packer AMI), ASG with instance refresh, EC2 instance role |
| `dns` | Deferred to Sprint 4-5 — Route 53, ACM, WAF. The app runs on the ALB DNS name until then. |
| Alerts (SNS + CloudWatch alarms) | Deferred to Sprint 4 — lands as an additive `modules/monitoring/alerts.tf`, gated by `enable_alerts`. |

## Layout

```
infrastructure/
├── versions.tf / providers.tf / variables.tf / outputs.tf / main.tf
├── backend.tf                 # S3 backend (bootstrapped, see below)
├── backend.hcl.example        # partial backend config to copy -> backend.hcl
├── terraform.tfvars.example   # copy -> terraform.tfvars
├── bootstrap/                 # one-time S3 + DynamoDB remote-state store
├── modules/                   # network, storage, monitoring, compute, dns
└── tests/                     # terraform test + structure check

lambda/pinger/                 # pinger Lambda source, zipped by data.archive_file
packer/                        # Packer template that bakes the backend app + nginx into an AMI
```

Module dependency order: `network -> compute / storage -> monitoring -> dns`.

## Data contracts

These are the shapes the infra, the pinger, and the backend API all agree on.

### `sites` table item (partition key `user_id`, sort key `site_id`)

Written by the backend API: `user_id`, `site_id` (uuid v4), `url`, `name`,
`check_frequency_minutes` (currently unenforced - every enabled site is
checked every 5 minutes), `enabled`, `created_at`, `updated_at`.

Written by the pinger via `UpdateItem` (conditioned on
`attribute_exists(site_id)`, so a check racing a delete never resurrects a
row):

| attr | type | notes |
|---|---|---|
| `status` | S | `"up"` \| `"down"`. Absent = not yet checked. `up` iff `200 <= status_code < 400`. |
| `status_code` | N \| null | null on transport error |
| `latency_ms` | N \| null | ms to response headers |
| `checked_at` | S | ISO-8601 UTC with ms |
| `error_type` | S \| null | `timeout` \| `dns_error` \| `connection_refused` \| `tls_error` \| `http_error` \| `blocked_url` \| `unknown` |
| `error_message` | S \| null | truncated to 256 chars |
| `consecutive_failures` | N | 0 when up |
| `last_status_change_at` | S | only moves when status flips |

### S3 history object key

```
sites/{user_id}/{site_id}/{YYYY}/{MM}/{DD}/{epoch_ms}-{check_id8}.json
```

Fixed-width `epoch_ms` means lexicographic order == chronological order
within a day partition, so `ListObjectsV2` + `StartAfter` is a free
pagination cursor for the history API. Body is JSON with `schema_version: 1`.
Bounded by the 90-day lifecycle rule on the `sites/` prefix.

## Port chain (compute)

```
browser --:80 HTTP--> ALB --:80--> target group --:80--> EC2 nginx:80 --proxy_pass--> Express 127.0.0.1:8080
```

The app ships as a Packer-baked AMI (`packer/backend-ami.pkr.hcl`) tagged
`Application=pulsemonitor-backend` - `modules/compute` picks the newest one
automatically unless `var.ami_id` is set. Build and publish a new AMI with:

```bash
cd backend && npm ci --omit=dev
cd ../packer && packer init backend-ami.pkr.hcl
packer build backend-ami.pkr.hcl
```

HTTPS is wired but inert until `var.certificate_arn` is set (the `dns`
module provisions it in a later sprint) - the HTTP listener forwards
directly today and switches to a redirect once a cert is present, with no
other changes required.

## Prerequisites

- Terraform >= 1.5 (developed on 1.15.8)
- AWS credentials (only needed to apply against real AWS - not for validate/test)
- For local testing: LocalStack Pro + [`terraform-local`](https://github.com/localstack/terraform-local) (`pip install terraform-local awscli-local`)

## Everyday commands (offline)

```bash
cd infrastructure
terraform fmt -recursive          # format
terraform init -backend=false     # load providers (no backend)
terraform validate                # check configuration
terraform test                    # run tests/*.tftest.hcl - fully offline, mocked aws provider
bash tests/structure.sh           # module scaffolding check
```

## Testing against LocalStack

`terraform test` proves resource shapes offline; it does not create real
resources or invoke real Lambdas. To exercise the actual data flow (Lambda
invocation, DynamoDB reads/writes, S3 objects), apply against a local
LocalStack Pro container instead of real AWS:

```bash
tflocal init -reconfigure     # tflocal auto-manages its own S3 state bucket in LocalStack
tflocal plan -out=localstack.tfplan -var="ami_id=ami-0123456789abcdef0"
tflocal apply localstack.tfplan
```

Note: LocalStack cannot execute real EC2 user-data/systemd inside launched
instances, so `compute` deploys there prove resource *shape* only (ALB,
target group, ASG, IAM all exist and are wired correctly) - not live traffic
serving. `storage` and `monitoring` are fully exercisable: seed a site with
`awslocal dynamodb put-item`, invoke the pinger with
`awslocal lambda invoke`, and confirm the result with
`awslocal dynamodb get-item` / `awslocal s3 ls`.

## Remote state (bootstrapped)

Bootstrap has been applied. Deployed resources:

| Resource | Name | ARN |
|---|---|---|
| S3 bucket | `pulsemonitor-tfstate` | `arn:aws:s3:::pulsemonitor-tfstate` |
| DynamoDB table | `pulsemonitor-tf-locks` | `arn:aws:dynamodb:us-east-1:713545429375:table/pulsemonitor-tf-locks` |

Region: `us-east-1`. Versioning and AES256 encryption confirmed on the
bucket; public access fully blocked.

```bash
# Re-run bootstrap only if the state bucket/lock table need to change:
cd infrastructure/bootstrap
terraform init && terraform apply

# Wire the root module to the S3 backend:
cd ..
cp backend.hcl.example backend.hcl      # fill in bootstrap outputs
terraform init -backend-config=backend.hcl
```

## CI

`.github/workflows/terraform.yml` runs fmt-check, the structure check, and
`validate` + `test` for both the root and bootstrap on every PR. No plan/apply,
no cloud credentials.
