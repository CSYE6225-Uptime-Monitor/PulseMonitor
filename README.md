# PulseMonitor

PulseMonitor is a website uptime monitoring platform built as the final project for
Northeastern's **CSYE 6225 – Network Structures and Cloud Computing**. Users register
websites they own or manage and get real-time visibility into availability, response
codes, and historical uptime trends. Health checks run automatically on a 5-minute
schedule with no manual intervention, and site owners are emailed when a monitored
site goes down or recovers.

Live domain: `pulsemonitor.online`

## Team

- Hiteshi Kawadia
- Darshan Aswathappa
- Nireeksha Huns

## Features

- User registration and login (session-based auth, CSRF-protected)
- Register, update, and delete websites to monitor from a personal dashboard
- Real-time uptime status and HTTP response codes per site
- Historical monitoring results and availability trends, paginated over S3
- Automatic email alerts on down/recovery transitions (not on every failed check)
- Account activity log and self-service data export
- Automatic background health checks on all registered sites, no manual polling

## Architecture

```
Users (Browser + JS)
   │
Amazon Route 53  (pulsemonitor.online)
   │
Amazon CloudFront  (CDN · global edge)
   │
AWS WAF
   │
┌─────────────────────────── Custom VPC · us-east-1 ───────────────────────────┐
│  Application Load Balancer (internet-facing)                                 │
│        │                                                                     │
│  Auto Scaling Group ──scales──► EC2 (nginx + Express)  [AZ us-east-1a]       │
│                       ──scales──► EC2 (nginx + Express)  [AZ us-east-1b]     │
│  Each AZ: private subnet (app) + public subnet (NAT Gateway) → Internet GW   │
└───────────────────────────────────────────────────────────────────────────--┘
          │                                                    │
          ▼                                                    ▼
   Storage                                              Observability
   ├─ DynamoDB: sites table                             CloudWatch → Amazon SNS
   ├─ S3: monitoring history
   ├─ S3: audit logs
   └─ S3: user data

Monitoring
   EventBridge (every 5 min) → Pinger Lambda → pings monitored sites,
   writes status to DynamoDB + history to S3, emits a SiteStatusChanged
   event on transitions → Notifier Lambda → SES email to the site owner
```

**Cloud architecture highlights**

- High availability via an Auto Scaling Group of EC2 instances behind an ALB, spread
  across two availability zones in a custom VPC
- Fast static content delivery through Amazon CloudFront
- Serverless scheduled health checks with AWS Lambda + Amazon EventBridge (5-minute
  cadence)
- Scalable NoSQL storage for site status in Amazon DynamoDB
- Durable object storage for monitoring history, audit logs, and user data exports in
  Amazon S3
- Web application protection with AWS WAF
- Centralized monitoring and alerting via CloudWatch, SNS, and per-owner email
  notifications through SES
- AMIs baked with Packer so instances boot without any GitHub/npm dependency at
  runtime

## Repository layout

```
backend/           Express REST API (Node.js)
frontend/          Next.js web app
lambda/pinger/     Scheduled Lambda that health-checks due sites
lambda/notifier/   Event-driven Lambda that emails owners on down/recovery
infrastructure/    Terraform for the full AWS deployment
packer/            Packer template that bakes the backend + nginx into an AMI
scripts/           Build/packaging helper scripts
.github/workflows/ CI (app tests) and CD (Terraform + deploy) pipelines
```

Each of `backend/`, `frontend/`, and `infrastructure/` has its own README with more
detail; this file gives the project-level overview.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS, Vitest + Testing Library, Playwright (e2e) |
| Backend | Node.js, Express 5, Zod validation, `cookie-session` + CSRF (`csrf-csrf`), Jest + Supertest |
| Data | Amazon DynamoDB (users, sites), Amazon S3 (monitoring history, audit logs, user data exports) |
| Compute | EC2 (Auto Scaling Group + ALB), AMIs built with Packer, nginx reverse proxy |
| Serverless | AWS Lambda (pinger, notifier), Amazon EventBridge (schedule + custom event bus) |
| Delivery / Edge | Amazon CloudFront, AWS WAF, Amazon Route 53 |
| Notifications | Amazon SES (owner emails), Amazon CloudWatch + SNS (operational alerts) |
| IaC / CI-CD | Terraform, GitHub Actions (`ci.yml`, `terraform.yml`, `deploy.yml`) |

## Getting started (local development)

### Prerequisites

- Node.js 22+
- Docker (for LocalStack, used to emulate DynamoDB + S3 locally)

### Backend

```bash
cd backend
cp .env.example .env
docker compose up -d          # starts LocalStack (DynamoDB + S3 on :4566)
npm ci
npm run dev                   # http://localhost:8080
```

Run the test suite:

```bash
npm test                      # jest --coverage
```

### Frontend

```bash
cd frontend
npm ci
npm run dev                   # http://localhost:3000
```

The frontend proxies `/api/*` to `BACKEND_URL` (defaults to
`http://localhost:8080`) — see `frontend/next.config.ts`.

```bash
npm test          # vitest unit/component tests
npm run test:e2e  # playwright end-to-end tests
npm run lint
npm run build
```

### Lambdas

```bash
cd lambda/pinger && npm ci && npm test
cd lambda/notifier && npm ci && npm test
```

## API overview

All responses use the envelope `{ success, data, error }`. Endpoints marked "auth"
need an active session cookie; mutating endpoints additionally require a CSRF token
obtained from `GET /v1/csrf-token`.

| Method | Path | Description |
|---|---|---|
| GET | `/healthz` | Liveness/readiness check across DynamoDB + S3 dependencies |
| GET | `/v1/csrf-token` | Issue a CSRF token for the session |
| POST | `/v1/user` | Register a new user |
| POST | `/v1/login` | Log in, starts a session |
| POST | `/v1/logout` | Log out (auth) |
| GET | `/v1/user/self` | Get the current user's profile (auth) |
| PUT | `/v1/user/self` | Update the current user's profile (auth) |
| GET | `/v1/user/self/activity` | Paginated account activity log (auth) |
| POST | `/v1/user/self/exports` | Request a data export (auth) |
| GET | `/v1/user/self/exports` | List past exports (auth) |
| GET | `/v1/user/self/exports/:id/download` | Presigned download URL for an export (auth) |
| POST | `/v1/sites` | Register a website to monitor (auth) |
| GET | `/v1/sites` | List the current user's monitored sites (auth) |
| GET | `/v1/sites/:id` | Get a single site (auth) |
| PUT | `/v1/sites/:id` | Update a site (auth) |
| DELETE | `/v1/sites/:id` | Remove a site (auth) |
| GET | `/v1/sites/:id/status` | Current status/last check for a site (auth) |
| GET | `/v1/sites/:id/history` | Paginated historical check results (auth) |

## Deployment

Infrastructure is provisioned with Terraform (`infrastructure/`), following the
module order `network → compute / storage → monitoring → dns`. GitHub Actions runs
three pipelines:

- **`ci.yml`** – backend and frontend tests/lint/build on every push and PR
- **`terraform.yml`** – validates and plans/applies infrastructure changes
- **`deploy.yml`** – packages the app (via `scripts/package-artifacts.sh`), bakes a
  new AMI with Packer, and rolls the update out through the Auto Scaling Group

DNS, HTTPS (ACM), WAF, and owner email notifications are implemented but off by
default, gated behind the `enable_dns` / `enable_https` / `enable_waf` /
`enable_notifications` Terraform variables — see `infrastructure/README.md` for the
full module status table and rollout notes.

## License

# Course project for CSYE 6225, Northeastern University.