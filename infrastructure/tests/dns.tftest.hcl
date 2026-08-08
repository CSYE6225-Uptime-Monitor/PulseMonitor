# TDD: verifies the dns module's Route 53 hosted zone, DNS-validated ACM
# certificate, ALB alias records, SES DKIM/SPF/DMARC/MAIL FROM records, and
# the optional WAFv2 web ACL. Runs offline (mocked "aws" provider).
#
# aws_acm_certificate.domain_validation_options is mocked explicitly with
# realistic entries: Terraform's mock provider generates EMPTY collections
# for computed list/set attributes with no override, so without this every
# aws_route53_record.cert_validation instance's name/type/records would
# resolve to null via one([]) and fail the plan with "Missing required
# argument" on nearly every run in this file - not a useful assertion
# failure, since enable_dns defaults to true across the shared variables
# block below.

mock_provider "aws" {
  mock_resource "aws_route53_zone" {
    defaults = {
      zone_id = "Z0123456789ABCDEFGHIJ"
      arn     = "arn:aws:route53:::hostedzone/Z0123456789ABCDEFGHIJ"
      name_servers = [
        "ns-1.awsdns-00.com",
        "ns-2.awsdns-01.net",
        "ns-3.awsdns-02.org",
        "ns-4.awsdns-03.co.uk",
      ]
    }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn    = "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555"
      status = "PENDING_VALIDATION"
      domain_validation_options = [
        {
          domain_name           = "pulsemonitor.online"
          resource_record_name  = "_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pulsemonitor.online."
          resource_record_type  = "CNAME"
          resource_record_value = "_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.acm-validations.aws."
        },
        {
          domain_name           = "www.pulsemonitor.online"
          resource_record_name  = "_cccccccccccccccccccccccccccccccc.www.pulsemonitor.online."
          resource_record_type  = "CNAME"
          resource_record_value = "_dddddddddddddddddddddddddddddddd.acm-validations.aws."
        },
      ]
    }
  }

  mock_resource "aws_acm_certificate_validation" {
    defaults = {
      certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/11111111-2222-3333-4444-555555555555"
    }
  }

  mock_resource "aws_route53_record" {
    defaults = {
      fqdn = "mock-record.pulsemonitor.online"
    }
  }

  mock_resource "aws_wafv2_web_acl" {
    defaults = {
      arn      = "arn:aws:wafv2:us-east-1:123456789012:regional/webacl/mock-web-acl/11111111-2222-3333-4444-555555555555"
      id       = "11111111-2222-3333-4444-555555555555"
      capacity = 700
    }
  }
}

# Shared inputs for every module-level run below. domain_name in particular is
# pinned rather than left to its default: `terraform test` applies root
# terraform.tfvars by name even into module { source = ... } runs (the same
# reasoning notifications.tftest.hcl documents for notification_sender_*), and
# a developer testing against their own domain would silently invalidate
# every apex/www string assertion in this file. It must also match the
# domain_name baked into the aws_acm_certificate mock above.
variables {
  project_name = "pulsemonitor"
  environment  = "dev"
  aws_region   = "us-east-1"
  domain_name  = "pulsemonitor.online"

  alb_dns_name = "mock-alb-123456789.us-east-1.elb.amazonaws.com"
  alb_zone_id  = "Z35SXDOTRQ7X7K" # us-east-1 ALB canonical hosted zone
  alb_arn      = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock-alb/1234567890123456"

  enable_dns   = true
  enable_https = false
  enable_waf   = false

  enable_ses_dkim         = false
  ses_dkim_tokens         = []
  ses_mail_from_subdomain = "mail"
  dmarc_report_email      = ""
}

run "dns_is_absent_by_default" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    enable_dns   = false
    enable_https = false
    enable_waf   = false
  }

  assert {
    condition     = length(aws_route53_zone.this) == 0
    error_message = "Hosted zone must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_acm_certificate.this) == 0
    error_message = "Certificate must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_route53_record.cert_validation) == 0
    error_message = "Validation records must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_acm_certificate_validation.this) == 0
    error_message = "Certificate validation must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_route53_record.apex) == 0 && length(aws_route53_record.www) == 0
    error_message = "Alias records must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_route53_record.ses_dkim) == 0 && length(aws_route53_record.spf) == 0 && length(aws_route53_record.dmarc) == 0
    error_message = "SES DNS records must not be created when enable_dns is false."
  }

  assert {
    condition     = length(aws_wafv2_web_acl.this) == 0 && length(aws_wafv2_web_acl_association.alb) == 0
    error_message = "WAF must not be created when enable_waf is false."
  }
}

run "zone_is_created_for_the_apex_domain" {
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = one(aws_route53_zone.this).name == "pulsemonitor.online"
    error_message = "Hosted zone must be for the configured apex domain."
  }

  assert {
    condition     = one(aws_route53_zone.this).force_destroy == false
    error_message = "The zone must not allow force_destroy - deleting it while it holds live records is not something to make easy, and the nameserver assignment cannot be undone."
  }
}

run "certificate_is_dns_validated_and_covers_www" {
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = one(aws_acm_certificate.this).validation_method == "DNS"
    error_message = "Must use DNS validation - EMAIL validation needs a human to click a link in a mailbox at the domain, which CI can never do."
  }

  assert {
    condition     = one(aws_acm_certificate.this).domain_name == "pulsemonitor.online"
    error_message = "Certificate must cover the apex domain."
  }

  assert {
    condition     = length(one(aws_acm_certificate.this).subject_alternative_names) == 1 && contains(one(aws_acm_certificate.this).subject_alternative_names, "www.pulsemonitor.online")
    error_message = "Certificate must cover exactly www.<domain> as its only SAN - no accidental wildcard, and the apex must not be repeated in the SAN list."
  }
}

run "cert_validation_records_exist_for_apex_and_www" {
  # plan (not apply): proves the for_each keys (local.cert_domains) are
  # static and therefore known at plan time. If this module were rewritten
  # to for_each directly over the computed domain_validation_options set,
  # this run would fail with "The for_each value depends on resource
  # attributes that cannot be determined until apply" - that failure is
  # exactly the regression this run guards against.
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = length(aws_route53_record.cert_validation) == 2
    error_message = "There must be exactly one validation record per cert domain (apex + www)."
  }

  assert {
    condition     = contains(keys(aws_route53_record.cert_validation), "pulsemonitor.online") && contains(keys(aws_route53_record.cert_validation), "www.pulsemonitor.online")
    error_message = "Validation records must be keyed by domain name for both the apex and www."
  }
}

run "cert_validation_records_use_the_acm_supplied_cname" {
  # apply (not plan): name/records are looked up from
  # aws_acm_certificate.this[0].domain_validation_options, a computed
  # attribute of another resource in the same plan - unresolved under
  # mock_provider until apply.
  command = apply

  module {
    source = "./modules/dns"
  }

  # fqdn overrides, distinct per instance: this is the first run in the file
  # that actually applies (creates) these two resources, and Terraform test
  # shares state across runs within a file - later runs whose variables don't
  # change this resource's config just inherit whatever got created here,
  # with no new apply action (and so no further chance to override). The
  # shared mock_resource "aws_route53_record" above gives every instance the
  # SAME generic fqdn, which validated_certificate_arn_is_exposed_once_https_
  # is_enabled later in this file needs to be distinct per instance to tell a
  # correct multi-record for-loop apart from a bug that hardcodes one record.
  override_resource {
    target = aws_route53_record.cert_validation["pulsemonitor.online"]
    values = {
      fqdn = "apex-validation.pulsemonitor.online"
    }
  }

  override_resource {
    target = aws_route53_record.cert_validation["www.pulsemonitor.online"]
    values = {
      fqdn = "www-validation.pulsemonitor.online"
    }
  }

  assert {
    condition     = aws_route53_record.cert_validation["pulsemonitor.online"].type == "CNAME"
    error_message = "ACM DNS validation records are always CNAME."
  }

  assert {
    condition     = aws_route53_record.cert_validation["pulsemonitor.online"].name == "_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.pulsemonitor.online."
    error_message = "The apex validation record must use the name ACM returned for the apex domain, not a hardcoded guess."
  }

  assert {
    condition     = tolist(aws_route53_record.cert_validation["www.pulsemonitor.online"].records)[0] == "_dddddddddddddddddddddddddddddddd.acm-validations.aws."
    error_message = "The www validation record must use the value ACM returned for the www domain, not the apex's."
  }

  assert {
    condition     = aws_route53_record.cert_validation["pulsemonitor.online"].allow_overwrite == true
    error_message = "allow_overwrite must be true - a certificate replacement (create_before_destroy) reuses the same validation record names, and Route 53 rejects a duplicate create without this."
  }
}

run "apex_alias_points_at_the_alb" {
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = one(aws_route53_record.apex).type == "A"
    error_message = "The apex record must be an A-alias, not AAAA - the ALB is IPv4-only (no ip_address_type set in modules/compute)."
  }

  assert {
    condition     = one(aws_route53_record.apex).name == "pulsemonitor.online"
    error_message = "The apex record's name must be the bare domain."
  }

  assert {
    condition     = one(aws_route53_record.apex).alias[0].name == var.alb_dns_name && one(aws_route53_record.apex).alias[0].zone_id == var.alb_zone_id
    error_message = "The apex alias must target the ALB's own DNS name and its own hosted zone ID - aliasing to the wrong zone ID resolves to nothing."
  }

  assert {
    condition     = one(aws_route53_record.apex).alias[0].evaluate_target_health == true
    error_message = "The alias should evaluate the ALB's target health so Route 53 can fail over."
  }

  assert {
    condition     = one(aws_route53_record.apex).ttl == null && one(aws_route53_record.apex).records == null
    error_message = "An alias record must not set ttl or records - Route 53 rejects a record with both an alias block and either of those present."
  }
}

run "www_alias_points_at_the_same_alb" {
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = one(aws_route53_record.www).type == "A"
    error_message = "The www record must be an A-alias, matching the apex - not a CNAME, which is illegal at the apex and inconsistent to mix with the apex's alias here."
  }

  assert {
    condition     = one(aws_route53_record.www).name == "www.pulsemonitor.online"
    error_message = "The www record's name must be www.<domain>."
  }

  assert {
    condition     = one(aws_route53_record.www).alias[0].name == var.alb_dns_name && one(aws_route53_record.www).alias[0].zone_id == var.alb_zone_id
    error_message = "The www alias must target the same ALB as the apex."
  }
}

run "alias_and_validation_records_live_in_the_zone_we_created" {
  # apply: aws_route53_zone.this[0].zone_id is a computed attribute.
  command = apply

  module {
    source = "./modules/dns"
  }

  assert {
    condition = (
      one(aws_route53_record.apex).zone_id == one(aws_route53_zone.this).zone_id &&
      one(aws_route53_record.www).zone_id == one(aws_route53_zone.this).zone_id &&
      alltrue([for r in aws_route53_record.cert_validation : r.zone_id == one(aws_route53_zone.this).zone_id])
    )
    error_message = "Every record this module creates must live in the zone it created - records written into an externally-supplied zone ID would apply cleanly and serve nothing."
  }
}

run "ses_dkim_records_are_absent_in_email_identity_mode" {
  command = plan

  module {
    source = "./modules/dns"
  }

  # dev.tfvars currently runs SES in "email" identity mode, where
  # ses_dkim_tokens is null - publishing three CNAMEs derived from a null
  # list would crash the plan, so this must be gated on its own flag rather
  # than inferred from the token list's presence.
  variables {
    enable_ses_dkim = false
    ses_dkim_tokens = []
  }

  assert {
    condition     = length(aws_route53_record.ses_dkim) == 0
    error_message = "DKIM records must not be created when enable_ses_dkim is false."
  }

  assert {
    condition     = length(aws_route53_record.mail_from_mx) == 0 && length(aws_route53_record.mail_from_spf) == 0
    error_message = "Custom MAIL FROM records must not be created when enable_ses_dkim is false."
  }
}

run "ses_dkim_records_are_published_for_the_domain_identity" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    enable_ses_dkim = true
    ses_dkim_tokens = ["tokenaaa", "tokenbbb", "tokenccc"]
  }

  assert {
    condition     = length(aws_route53_record.ses_dkim) == 3
    error_message = "Easy DKIM always issues exactly 3 tokens - one CNAME each."
  }

  assert {
    condition     = aws_route53_record.ses_dkim[0].name == "tokenaaa._domainkey.pulsemonitor.online"
    error_message = "Each DKIM record's name must be <token>._domainkey.<domain> - this is the exact record set modules/monitoring's ses_dkim_tokens output otherwise tells a human to publish by hand."
  }

  assert {
    condition     = aws_route53_record.ses_dkim[0].type == "CNAME" && tolist(aws_route53_record.ses_dkim[0].records)[0] == "tokenaaa.dkim.amazonses.com"
    error_message = "Each DKIM record must be a CNAME to <token>.dkim.amazonses.com."
  }

  assert {
    condition     = aws_route53_record.mail_from_mx[0].name == "mail.pulsemonitor.online" && tolist(aws_route53_record.mail_from_mx[0].records)[0] == "10 feedback-smtp.us-east-1.amazonses.com"
    error_message = "The custom MAIL FROM MX record must point at the region-specific SES feedback endpoint."
  }

  assert {
    condition     = aws_route53_record.mail_from_spf[0].name == "mail.pulsemonitor.online" && aws_route53_record.mail_from_spf[0].type == "TXT"
    error_message = "The custom MAIL FROM subdomain needs its own SPF TXT record - SPF is evaluated against the envelope sender (this subdomain), not the apex."
  }
}

run "spf_and_dmarc_records_are_published" {
  command = plan

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = one(aws_route53_record.spf).type == "TXT" && one(aws_route53_record.spf).name == "pulsemonitor.online"
    error_message = "SPF must be a TXT record at the apex."
  }

  assert {
    condition     = tolist(one(aws_route53_record.spf).records)[0] == "v=spf1 include:amazonses.com ~all"
    error_message = "Apex SPF must authorize amazonses.com with a soft fail."
  }

  assert {
    condition     = one(aws_route53_record.dmarc).name == "_dmarc.pulsemonitor.online"
    error_message = "DMARC must be published at _dmarc.<domain>."
  }

  assert {
    condition     = strcontains(tolist(one(aws_route53_record.dmarc).records)[0], "v=DMARC1") && strcontains(tolist(one(aws_route53_record.dmarc).records)[0], "p=none")
    error_message = "DMARC must start at p=none - a stricter policy before DKIM/SPF alignment is confirmed would silently blackhole every notification email."
  }

  assert {
    condition     = !strcontains(tolist(one(aws_route53_record.dmarc).records)[0], "rua=")
    error_message = "With dmarc_report_email unset, no rua= should be published - a cross-domain report address needs an authorization record in the REPORT domain's zone, which this module cannot create, and is silently ignored without it."
  }
}

run "dmarc_report_email_adds_rua_when_set" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    dmarc_report_email = "alerts@pulsemonitor.online"
  }

  assert {
    condition     = strcontains(tolist(one(aws_route53_record.dmarc).records)[0], "rua=mailto:alerts@pulsemonitor.online")
    error_message = "Setting dmarc_report_email must add a rua= mailto record."
  }
}

run "waf_is_absent_when_disabled_even_with_dns_enabled" {
  command = plan

  module {
    source = "./modules/dns"
  }

  # enable_dns is true (from the shared block); this proves WAF is gated on
  # its OWN flag rather than piggybacking on enable_dns.
  assert {
    condition     = length(aws_wafv2_web_acl.this) == 0 && length(aws_wafv2_web_acl_association.alb) == 0
    error_message = "WAF must stay off when enable_waf is false, independent of enable_dns."
  }
}

run "web_acl_is_regional_with_managed_rules_and_default_allow" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    enable_waf = true
  }

  assert {
    condition     = one(aws_wafv2_web_acl.this).scope == "REGIONAL"
    error_message = "Scope must be REGIONAL - CLOUDFRONT-scope ACLs cannot be associated with an ALB."
  }

  assert {
    condition     = length(one(aws_wafv2_web_acl.this).default_action[0].allow) == 1 && length(one(aws_wafv2_web_acl.this).default_action[0].block) == 0
    error_message = "Default action must be allow - default-block would take the site down the moment WAF is enabled."
  }

  assert {
    condition     = length([for r in one(aws_wafv2_web_acl.this).rule : r if r.name == "AWSManagedRulesCommonRuleSet"]) == 1
    error_message = "The Common Rule Set managed group must be present."
  }

  assert {
    condition     = length([for r in one(aws_wafv2_web_acl.this).rule : r if r.name == "RateLimitPerIP"]) == 1
    error_message = "A per-IP rate limit rule must be present."
  }

  assert {
    condition     = one(aws_wafv2_web_acl.this).visibility_config[0].cloudwatch_metrics_enabled == true && one(aws_wafv2_web_acl.this).visibility_config[0].sampled_requests_enabled == true
    error_message = "The ACL-level visibility_config must enable both CloudWatch metrics and sampled requests."
  }
}

run "web_acl_is_associated_with_the_alb" {
  # apply: web_acl_arn is a computed attribute of aws_wafv2_web_acl.this[0].
  command = apply

  module {
    source = "./modules/dns"
  }

  variables {
    enable_waf = true
  }

  assert {
    condition     = one(aws_wafv2_web_acl_association.alb).resource_arn == var.alb_arn
    error_message = "The association must target the ALB passed in."
  }

  assert {
    condition     = one(aws_wafv2_web_acl_association.alb).web_acl_arn == one(aws_wafv2_web_acl.this).arn
    error_message = "The association must point at the web ACL this module created - an unassociated web ACL costs money and inspects nothing."
  }
}

run "certificate_validation_does_not_block_until_https_is_enabled" {
  # This is the most important run in this file: aws_acm_certificate_validation
  # BLOCKS until its validation CNAME resolves publicly. While the domain is
  # still delegated to the external registrar, it never will, and an apply
  # would hang for the resource's timeout while holding the deploy pipeline's
  # serialized concurrency group. enable_dns must be able to create the zone
  # and the pending certificate without ever instantiating this resource.
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    enable_dns   = true
    enable_https = false
  }

  assert {
    condition     = length(aws_acm_certificate_validation.this) == 0
    error_message = "aws_acm_certificate_validation must not exist while enable_https is false, even with enable_dns true."
  }
}

run "enabling_https_adds_the_blocking_validation_with_a_bounded_timeout" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    enable_https = true
  }

  assert {
    condition     = length(aws_acm_certificate_validation.this) == 1
    error_message = "aws_acm_certificate_validation must exist once enable_https is true."
  }

  assert {
    condition     = one(aws_acm_certificate_validation.this).timeouts.create == "10m"
    error_message = "The create timeout must be bounded well under the provider's 75m default, so a pre-delegation apply fails fast instead of hanging the deploy pipeline's concurrency group."
  }
}

run "validated_certificate_arn_is_null_until_https_is_enabled" {
  # apply: output.certificate_arn resolves one(aws_acm_certificate_validation...),
  # a computed attribute.
  command = apply

  module {
    source = "./modules/dns"
  }

  variables {
    enable_https = false
  }

  assert {
    condition     = output.certificate_arn == null
    error_message = "certificate_arn must be null until enable_https is true - handing module.compute the ARN of a PENDING_VALIDATION certificate would make CreateListener fail with CertificateNotFound."
  }
}

run "validated_certificate_arn_is_exposed_once_https_is_enabled" {
  command = apply

  module {
    source = "./modules/dns"
  }

  variables {
    enable_https = true
  }

  # No override_resource needed here for the fqdn distinctness this run's
  # second assertion depends on: cert_validation's config hasn't changed
  # since cert_validation_records_use_the_acm_supplied_cname created it
  # earlier in this file (state is shared across runs), so it's still
  # carrying the distinct fqdns overridden there - this run only changes
  # enable_https, which those two resource instances don't depend on.
  assert {
    condition     = output.certificate_arn == one(aws_acm_certificate_validation.this).certificate_arn
    error_message = "certificate_arn output must be the VALIDATION resource's certificate_arn, not the certificate resource's own arn."
  }

  assert {
    condition     = length(one(aws_acm_certificate_validation.this).validation_record_fqdns) == 2
    error_message = "Both the apex and www validation FQDNs must be passed - passing only one leaves the other SAN unvalidated and the certificate stays pending forever."
  }
}

run "name_servers_are_exposed_for_the_registrar_handoff" {
  # apply: name_servers is a computed attribute of aws_route53_zone.this[0].
  command = apply

  module {
    source = "./modules/dns"
  }

  assert {
    condition     = length(output.name_servers) == 4
    error_message = "Exactly 4 nameservers must be exposed - these are the values a human pastes into the registrar's Custom DNS settings, and without this output that handoff has no source of truth."
  }
}

run "rejects_an_empty_domain_name" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    domain_name = ""
  }

  expect_failures = [var.domain_name]
}

run "rejects_a_domain_name_with_a_trailing_dot" {
  command = plan

  module {
    source = "./modules/dns"
  }

  variables {
    domain_name = "pulsemonitor.online."
  }

  expect_failures = [var.domain_name]
}
