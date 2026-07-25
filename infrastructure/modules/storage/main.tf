# Module: storage
# Responsibility: durable data stores for PulseMonitor.
#
# Layer scope (implemented in a later sprint — no resources yet):
#   - S3 bucket: user data
#   - S3 bucket: audit logs
#   - S3 bucket: monitoring history
#     (all versioned, encrypted, public access blocked)
#   - DynamoDB "sites" table (monitored sites config/status)
#
# TODO(sprint-storage): declare the resources above.
