# Module: dns
# Responsibility: public entrypoint, TLS, and edge protection.
#
# Layer scope (implemented in a later sprint — no resources yet):
#   - Route 53 hosted zone / records for var.domain_name -> ALB (alias)
#   - ACM certificate (DNS-validated) for HTTPS
#   - AWS WAF web ACL + association with the ALB
#
# Depends on: compute (alb_dns_name, alb_zone_id).
# TODO(sprint-dns): declare the resources above.
