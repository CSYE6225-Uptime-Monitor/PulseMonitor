# Module: monitoring
# Responsibility: the scheduled pinger and observability/alerting pipeline.
#
# Layer scope (implemented in a later sprint — no resources yet):
#   - EventBridge rule (rate: every 5 minutes) -> Pinger Lambda
#   - Pinger Lambda + IAM role (reads sites table, writes status/history)
#   - CloudWatch log groups + metric alarms
#   - SNS topic for alert notifications
#
# Depends on: storage (sites table, monitoring-history bucket).
# TODO(sprint-monitoring): declare the resources above.
