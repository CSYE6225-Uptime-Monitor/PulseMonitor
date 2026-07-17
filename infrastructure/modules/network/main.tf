# Module: network
# Responsibility: foundational networking for PulseMonitor.
#
# Layer scope (implemented in a later sprint — no resources yet):
#   - Custom VPC (var.vpc_cidr)
#   - Public subnets  (one per AZ)  -> NAT Gateways + IGW route
#   - Private subnets (one per AZ)  -> EC2 app tier, route to NAT
#   - Internet Gateway (ingress/egress for public tier)
#   - NAT Gateway per AZ (private-tier egress)
#   - Route tables + associations
#   - Security groups: ALB SG (443/80 from internet), app SG (from ALB only)
#
# TODO(sprint-network): declare the resources above.
