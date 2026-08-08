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
| `dns` | Implemented, off by default — Route 53 zone, DNS-validated ACM cert (apex + www), alias records, SES DKIM/SPF/DMARC, optional WAFv2. Gated by `enable_dns` / `enable_https` / `enable_waf`; see [HTTPS rollout](#https-rollout) below. |
| Alerts (SNS + CloudWatch alarms) | Deferred to Sprint 4 — lands as an additive `modules/monitoring/alerts.tf`, gated by `enable_alerts`. |
| Notifications (per-owner down/recovery email) | Implemented, off by default — custom EventBridge bus, notifier Lambda (`lambda/notifier/`), SES domain identity. Gated by `enable_notifications`; see [Site notifications](#site-notifications) below. |

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
lambda/notifier/                # notifier Lambda source, zipped by data.archive_file
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

### `users` table `user_id-index` GSI (hash key `user_id`, `KEYS_ONLY`)

Lets the notifier resolve a site's owner email from `user_id` without a
`Scan` and without base-table access - `KEYS_ONLY` projects the GSI's own key
plus the base table's key (`email`), so the index contains exactly
`{user_id, email}` and nothing else (not `password_hash`). Sparse: an
account created before `user_id` existed simply has no entry until its next
login (see `verifyCredentials` in `backend/src/services/userService.js`).

### `SiteStatusChanged` EventBridge event (custom bus `pulsemonitor-{env}-site-events`)

Published by the pinger only on a status *transition* (never on every failed
check) - see `lambda/pinger/lib/events.js`. `Source: "pulsemonitor.pinger"`,
`DetailType: "SiteStatusChanged"`. `detail`:

| field | type | notes |
|---|---|---|
| `site_id`, `user_id`, `url`, `name` | S | copied from the scanned site |
| `status` | S | `"up"` \| `"down"` - the new status |
| `previous_status` | S \| null | `null` (not omitted) on a site's first check |
| `previous_status_change_at` | S \| null | used by the notifier to compute downtime on recovery |
| `status_code`, `latency_ms`, `error_type`, `error_message` | - | the ping result, same shapes as the `sites` table |
| `checked_at` | S | ISO-8601 UTC with ms |

Two rules consume this: `site-down` matches `status: ["down"]` (deliberately
not constraining `previous_status`, so a newly added site that's already
down still alerts), and `site-recovered` matches `status: ["up"]` **and**
`previous_status: ["down"]` (so a brand-new site's first successful check —
where `previous_status` is JSON `null` — never triggers a false "recovered"
email).

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

HTTPS is wired but inert until `enable_https` is true - the HTTP listener
forwards directly today and switches to a 301 redirect once flipped, with the
HTTPS listener presenting the certificate `module.dns` validated. See
[HTTPS rollout](#https-rollout) below for why this is two flags and what the
manual step in between is.

## HTTPS rollout

`pulsemonitor.online` is registered at an external registrar (Namecheap), so
Terraform can create a Route 53 hosted zone but cannot delegate the domain's
nameservers to it - that's a manual step at the registrar. `enable_dns` and
`enable_https` are separate flags for exactly this reason: `enable_https`
adds `aws_acm_certificate_validation`, which *blocks* until its validation
CNAME resolves publicly, and would otherwise hang every apply for its full
timeout until delegation happens.

1. `enable_dns = true`, apply. Creates the zone, a `PENDING_VALIDATION`
   certificate, its validation CNAMEs, and the apex/www alias records.
   Nothing public changes yet - the ALB still serves on its own DNS name.
2. Read `terraform output name_servers` (4 values). At the registrar, switch
   to Custom DNS and paste all four in.
3. Verify from a resolver outside AWS (not by querying the AWS nameservers
   directly, which answer correctly regardless of delegation):
   ```bash
   dig +short NS pulsemonitor.online @8.8.8.8   # must return the 4 awsdns hosts
   dig +short pulsemonitor.online                # must return the ALB's IPs
   ```
   Namecheap propagation is usually minutes; the TLD's own NS TTL can hold up
   to 48h. Switching to Custom DNS disables Namecheap's free email forwarding
   and parking records. The certificate should flip to `ISSUED` on its own
   within minutes of delegation - confirm with `aws acm describe-certificate`
   before the next step so validation returns in seconds rather than polling.
4. `enable_https = true`, apply. Certificate validation completes fast (the
   cert is already issued), the HTTPS listener is created, HTTP becomes a
   301, and `cookie_secure` flips to true - which changes the launch
   template's user-data and triggers a rolling ASG instance refresh
   (`min_healthy_percentage = 50`, `auto_rollback = true`). Budget ~10
   minutes.

The Route 53 zone has `prevent_destroy = true`: flipping `enable_dns` back to
`false` or running `terraform destroy` would delete it, and recreating it
assigns four *different* nameservers - another manual registrar edit and
another propagation wait. Comment out the lifecycle block deliberately if
that's ever actually intended.

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
| DynamoDB table | `pulsemonitor-tf-locks` | `arn:aws:dynamodb:us-east-1:611467706761:table/pulsemonitor-tf-locks` |

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

## Site notifications

Set `enable_notifications = true` plus `notification_sender_domain` and
`notification_sender_email` (see `terraform.tfvars.example`) to turn on
per-owner down/recovery emails. Everything is additive and gated by
`enable_notifications` - disabled is the default, and the whole pipeline
(custom bus, both rules, notifier Lambda, DLQ, SES identities) doesn't exist
in the plan when it's off.

**`terraform apply` succeeds while SES verification is still pending** - this
is the trap to know about. Domain identities can't be verified by Terraform
(there's no waiter for it); a human has to publish DNS records first:

1. `terraform apply`, then read the `ses_dkim_tokens` output - 3 CNAME
   records (name -> value).
2. Publish all 3 at the domain registrar for `notification_sender_domain`.
3. Poll until verified (DNS propagation, not instant):
   ```bash
   aws sesv2 get-email-identity --email-identity <notification_sender_domain>
   # wait for VerifiedForSendingStatus: true
   ```
4. Until then, and until AWS grants **SES production access** (a support
   request - see `aws sesv2 get-account`), the account is in the sandbox:
   only verified recipient identities can receive mail. Verify test
   addresses via `notification_verified_recipients` (each needs a
   manual click-through on the email AWS sends), or set
   `notification_override_recipient` to redirect every notification to one
   verified mailbox for end-to-end testing (forbidden when
   `environment = "prod"` - see the variable's validation in
   `modules/monitoring/variables.tf`).

A failed send is either swallowed (permanent: unverified recipient,
suspended account - logged + an EMF `NotificationFailed` metric, see
`lambda/notifier/lib/email.js::isPermanentRejection`) or retried by Lambda
and, if still failing, lands in the `notifier-dlq` SQS queue
(`notifier_dlq_url` output).

## CI

Three workflows, split by paths filter so every directory is covered:

| Workflow | Triggers on | Does |
|---|---|---|
| `terraform.yml` | `infrastructure/**`, `lambda/**` | fmt-check, structure check, `validate` + `test` for root and bootstrap, plus pinger/notifier jest. No credentials. |
| `ci.yml` | `backend/**`, `frontend/**` | backend jest, frontend lint + vitest + production build. No credentials. |
| `deploy.yml` | push to `main` (any deployable path), or manual dispatch | Re-runs all four test suites, rebuilds the AMI **only if application code changed**, then `terraform apply`. |

## Continuous deployment

`deploy.yml` deploys to the dev environment on merge to `main`:

```
test (backend, frontend, pinger, notifier)
  └─ deploy
       ├─ authenticate with stored AWS access keys (see below)
       ├─ decide whether the AMI needs rebuilding
       │    rebuild when backend/, frontend/, packer/ or scripts/ changed
       │    skip when only infrastructure/ or lambda/ changed
       ├─ (if rebuilding) ./scripts/package-artifacts.sh + packer build
       └─ terraform init / plan / apply -var-file=environments/dev.tfvars
```

Rolling out a new AMI is handled by AWS, not the workflow: `data.aws_ami.app`
picks the newest image tagged `Application=pulsemonitor-backend`, which changes
the launch template, which triggers the ASG's `instance_refresh` (Rolling,
`min_healthy_percentage = 50`, `auto_rollback = true`) — one instance at a
time, rolled back automatically if the new one fails its health check.

A `concurrency` group serialises deploys: two applies against one state file
would contend for the lock and could leave a half-rolled ASG. In-flight
deploys are never cancelled.

### One-time setup

`deploy.yml` authenticates with long-lived AWS access keys, not OIDC: this
GitHub org's OIDC policy blocks `AssumeRoleWithWebIdentity`, so
`aws-actions/configure-aws-credentials` is configured with
`secrets.AWS_ACCESS_KEY_ID` / `secrets.AWS_SECRET_ACCESS_KEY` instead of
`role-to-assume`. Add those two repository secrets under *Settings → Secrets
and variables → Actions → Secrets*.

The key's IAM user needs, at minimum: EC2/ASG/Auto Scaling/ELB/IAM (for
Terraform's own resources), the S3/DynamoDB backend actions, Route 53 +
ACM (+ WAFv2, if `enable_waf` is used - see `modules/dns/main.tf`'s header
for exact actions, including the easy-to-miss `route53:GetChange` and
`elasticloadbalancing:SetWebAcl`), and permission to read/create the AMI
Packer builds. Attach these out of band (this repo doesn't manage the
deploy user); do it *before* setting `enable_dns = true`, since a merge that
fails mid-`CreateHostedZone` on AccessDenied leaves partial state under a
held lock.

`infrastructure/bootstrap` still defines a GitHub OIDC provider + deploy role
(`aws_iam_openid_connect_provider`, `aws_iam_role.github_deploy`), gated by
`enable_github_oidc`. It is dormant - nothing in `deploy.yml` assumes it -
kept in case the org policy changes and OIDC becomes usable again.

### Environment configuration

`environments/dev.tfvars` is **committed** and is the single source of truth for
what is deployed — CI and humans both pass it explicitly:

```bash
terraform apply -var-file=environments/dev.tfvars
```

It is deliberately not named `terraform.tfvars`, for two reasons. A gitignored
`terraform.tfvars` would leave CI applying variable *defaults* — and
`enable_notifications` (and now `enable_dns` / `enable_https` / `enable_waf`)
default to `false`, so the first automated deploy would destroy the whole
notification and DNS stack. It is also auto-loaded by `terraform test`, which
leaks its values into module-level test runs. Nothing secret lives in it: the
session secret is generated by `random_password` into SSM, and AWS credentials
come from the two access-key secrets described in
[One-time setup](#one-time-setup) above.
