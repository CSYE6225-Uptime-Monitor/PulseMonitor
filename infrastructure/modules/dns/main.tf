# Module: dns
# Responsibility: public entrypoint, TLS, and edge protection.
#
# Layer scope:
#   - Route 53 hosted zone / records for var.domain_name -> ALB (alias)
#   - ACM certificate (DNS-validated) for HTTPS, apex + www SAN
#   - SES DKIM/SPF/DMARC + custom MAIL FROM records (feeds module.monitoring's
#     domain-identity mode)
#   - AWS WAFv2 web ACL + association with the ALB
#
# Depends on: compute (alb_dns_name, alb_zone_id, alb_arn), monitoring
# (ses_dkim_tokens, via the root module only - never the other way around,
# or SES DKIM would create a monitoring -> dns -> monitoring cycle).
#
# Two flags gate two different failure modes, not one:
#   - enable_dns creates the zone, the certificate, its validation records,
#     and the alias records. Non-blocking.
#   - enable_https additionally creates aws_acm_certificate_validation, which
#     BLOCKS until the validation CNAME resolves publicly. The domain is
#     registered at an external registrar (Namecheap), so nameserver
#     delegation to the zone this module creates is a manual, out-of-band
#     step. Merging the two flags would mean the validation resource polls
#     for its full default timeout (75m) on every apply until that manual
#     step happens, holding the deploy pipeline's serialized concurrency
#     group hostage the whole time.
#
# See infrastructure/main.tf for the module-level wiring and why neither
# direction of depends_on between this module and module.compute is safe.

locals {
  name_prefix = "${var.project_name}-${var.environment}"

  # Static set, not a for_each over the computed domain_validation_options:
  # for_each keys must be known at plan time. domain_name and every SAN are
  # plain variables/literals (never derived from another resource's
  # attribute), which is what keeps ACM's CustomizeDiff-populated
  # domain_validation_options set's *keys* known at plan even though its
  # *values* (the actual CNAME name/value) stay unknown until apply.
  cert_domains = var.enable_dns ? toset([var.domain_name, "www.${var.domain_name}"]) : toset([])
}

# The NS set assigned here is what gets typed into Namecheap by hand.
# Destroying and recreating this zone invalidates that delegation and costs
# another manual registrar round trip plus up to 48h of propagation -
# everything else in this stack is disposable; this is not.
resource "aws_route53_zone" "this" {
  count = var.enable_dns ? 1 : 0

  name          = var.domain_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }

  tags = { Name = "${local.name_prefix}-zone" }
}

# create_before_destroy: a SAN change forces cert replacement, and ACM
# refuses to delete a certificate that is in use by a load balancer listener.
# Without CBD, the default destroy-then-create ordering deadlocks with
# ResourceInUseException. This is also why aws_route53_record.cert_validation
# below needs allow_overwrite = true - the replacement cert's validation
# records land on the same names as the incumbent's.
resource "aws_acm_certificate" "this" {
  count = var.enable_dns ? 1 : 0

  domain_name = var.domain_name
  # Never repeat the apex here - it is domain_name already, and a duplicate
  # can make ACM's response and the plan's pre-populated validation-option
  # set disagree in element count.
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = { Name = "${local.name_prefix}-cert" }
}

resource "aws_route53_record" "cert_validation" {
  for_each = local.cert_domains

  zone_id = aws_route53_zone.this[0].zone_id
  name    = one([for dvo in aws_acm_certificate.this[0].domain_validation_options : dvo.resource_record_name if dvo.domain_name == each.key])
  type    = one([for dvo in aws_acm_certificate.this[0].domain_validation_options : dvo.resource_record_type if dvo.domain_name == each.key])
  records = [one([for dvo in aws_acm_certificate.this[0].domain_validation_options : dvo.resource_record_value if dvo.domain_name == each.key])]
  ttl     = 60

  # Required for cert replacement (create_before_destroy above): the new
  # cert's validation records target the same names as the old one's, and
  # Route 53 rejects a duplicate CreateResourceRecordSets without this.
  allow_overwrite = true
}

# BLOCKS until the validation CNAMEs resolve publicly - gated on enable_https
# separately from enable_dns for exactly that reason. See the file header.
resource "aws_acm_certificate_validation" "this" {
  count = var.enable_dns && var.enable_https ? 1 : 0

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]

  # Default is 75m. Once delegation is live, DNS validation completes in
  # minutes; if it hasn't in ten, delegation is wrong and waiting longer
  # doesn't fix it. The deploy pipeline's concurrency group does not cancel
  # in-progress runs, so every extra minute here queues every other merge to
  # main behind a deploy that will fail anyway.
  timeouts {
    create = "10m"
  }
}

# Apex A-alias. No AAAA: aws_lb.this in modules/compute sets no
# ip_address_type, so it defaults to "ipv4" - an AAAA alias to an IPv4-only
# ALB resolves to NODATA, costs Happy-Eyeballs clients a wasted round trip,
# and some external uptime checkers flag it as a soft failure. Going
# dual-stack is a modules/network project (VPC IPv6 CIDR, subnet
# associations, ALB SG IPv6 ingress, ip_address_type = "dualstack"), not a
# DNS one - do not add AAAA records here.
resource "aws_route53_record" "apex" {
  count = var.enable_dns ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "www" {
  count = var.enable_dns ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = "www.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Easy DKIM always issues exactly 3 tokens (BYODKIM would be 1; unsupported
# here). count, not for_each over the token list: ses_dkim_tokens is a
# computed attribute of module.monitoring's SES identity, unknown-length at
# plan on the apply that first creates it - count must be known at plan, so
# it's gated on the caller-supplied enable_ses_dkim bool instead.
resource "aws_route53_record" "ses_dkim" {
  count = var.enable_dns && var.enable_ses_dkim ? 3 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = "${var.ses_dkim_tokens[count.index]}._domainkey.${var.domain_name}"
  type    = "CNAME"
  ttl     = 600
  records = ["${var.ses_dkim_tokens[count.index]}.dkim.amazonses.com"]
}

# Inert until a custom MAIL FROM domain is configured below: without one, SES
# uses amazonses.com as the envelope sender, so SPF here is evaluated against
# amazonses.com, not this domain. Published anyway because it is the correct
# apex record regardless, and exactly one SPF TXT record may exist at a name -
# merge any future sender's requirements into this one rather than adding a
# second.
resource "aws_route53_record" "spf" {
  count = var.enable_dns ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = var.domain_name
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

resource "aws_route53_record" "dmarc" {
  count = var.enable_dns ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  # p=none (not reject/quarantine): a stricter policy before DKIM/SPF
  # alignment is confirmed would silently blackhole every notification
  # email. rua= is only included when dmarc_report_email is set - an
  # aggregate-report address outside this domain needs a
  # "<domain>._report._dmarc.<report-domain>" TXT authorization record in
  # the REPORT domain's zone, which this module cannot create, and is
  # silently ignored by reporters without it.
  records = [
    var.dmarc_report_email != "" ? "v=DMARC1; p=none; rua=mailto:${var.dmarc_report_email};" : "v=DMARC1; p=none;"
  ]
}

# Custom MAIL FROM: makes mail show as sent by this domain (not "via
# amazonses.com") and gives SPF a real alignment leg alongside DKIM. The
# subdomain must differ from domain_name and must not receive other mail -
# "mail." satisfies both since the apex has no MX. The MX target is
# region-specific and must match the region module.monitoring's SES identity
# lives in.
resource "aws_route53_record" "mail_from_mx" {
  count = var.enable_dns && var.enable_ses_dkim ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = "${var.ses_mail_from_subdomain}.${var.domain_name}"
  type    = "MX"
  ttl     = 300
  records = ["10 feedback-smtp.${var.aws_region}.amazonses.com"]
}

resource "aws_route53_record" "mail_from_spf" {
  count = var.enable_dns && var.enable_ses_dkim ? 1 : 0

  zone_id = aws_route53_zone.this[0].zone_id
  name    = "${var.ses_mail_from_subdomain}.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = ["v=spf1 include:amazonses.com ~all"]
}

# REGIONAL scope (not CLOUDFRONT): this ACL protects an ALB, and REGIONAL
# scope follows the ambient provider region - no aliased us-east-1 provider
# needed (that requirement is CLOUDFRONT-only, and for a different reason).
# AWSManagedRulesSQLiRuleSet is deliberately excluded: the app is
# DynamoDB-only, and it is the highest-false-positive group in the catalogue
# for a backend with no SQL surface.
resource "aws_wafv2_web_acl" "this" {
  count = var.enable_waf ? 1 : 0

  name  = "${local.name_prefix}-waf"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 10

    # Managed rule groups take override_action, never action - the reverse
    # of the rate-based rule below. none{} means "apply the group's own
    # per-rule actions as authored"; count{} would mean "log only".
    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 20

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"

        # SizeRestrictions_BODY blocks request bodies over 8KB, which the
        # data-export endpoints can exceed. Count first; tighten after
        # reviewing sampled requests rather than guessing at a false-positive
        # rate up front.
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-common-rule-set"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "AWSManagedRulesKnownBadInputsRuleSet"
    priority = 30

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-known-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "RateLimitPerIP"
    priority = 40

    # Rate-based statements take action, never override_action - the reverse
    # of the managed rule groups above.
    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit = 2000 # requests per 5-minute sliding window per client IP
        # "IP" is the TCP peer as the ALB sees it, i.e. the real client.
        # FORWARDED_IP would only be correct behind a proxy like CloudFront
        # that this stack does not have in front of the ALB.
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${local.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Required at the ACL level in addition to each rule's own block.
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name_prefix}-waf"
    sampled_requests_enabled   = true
  }

  tags = { Name = "${local.name_prefix}-waf" }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count = var.enable_waf ? 1 : 0

  resource_arn = var.alb_arn
  web_acl_arn  = aws_wafv2_web_acl.this[0].arn
}
