# Module: compute
# Responsibility: the internet-facing app tier behind the ALB.
#
# Layer scope (implemented in a later sprint — no resources yet):
#   - Application Load Balancer (internet-facing, public subnets)
#   - Target group + HTTPS/HTTP listeners
#   - Launch template (EC2: nginx + Express API AMI, user data)
#   - Auto Scaling Group across private subnets in both AZs
#   - EC2 IAM role / instance profile (S3, DynamoDB, CloudWatch access)
#
# Depends on: network (subnet ids, security group ids).
# TODO(sprint-compute): declare the resources above.
