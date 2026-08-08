# Outputs for the dns module.

output "zone_id" {
  description = "ID of the Route 53 hosted zone. Null when enable_dns is false."
  value       = one(aws_route53_zone.this[*].zone_id)
}

output "name_servers" {
  description = "The 4 nameservers to paste into the registrar's Custom DNS settings (Namecheap: Domain > Nameservers > Custom DNS). Null when enable_dns is false."
  value       = one(aws_route53_zone.this[*].name_servers)
}

# The VALIDATED certificate's ARN - deliberately the validation resource's
# certificate_arn, never aws_acm_certificate.this[0].arn directly. Handing
# module.compute the ARN of a PENDING_VALIDATION certificate makes ALB
# CreateListener fail with CertificateNotFound, so this output is
# structurally null until enable_https is true and validation has completed,
# rather than relying on the caller to check readiness itself.
output "certificate_arn" {
  description = "ARN of the validated ACM certificate. Null unless enable_dns and enable_https are both true."
  value       = one(aws_acm_certificate_validation.this[*].certificate_arn)
}

output "web_acl_arn" {
  description = "ARN of the WAFv2 web ACL. Null when enable_waf is false."
  value       = one(aws_wafv2_web_acl.this[*].arn)
}
