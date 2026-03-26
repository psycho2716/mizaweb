# Monitoring and Alerts

## Backend

- Health endpoint monitor: `/health` every 30 seconds.
- Alert thresholds:
  - 5xx error rate > 2% for 5 minutes
  - p95 latency > 1200 ms for 10 minutes
  - process restarts > 3 in 15 minutes

## Frontend

- Alert on failed page load spikes and JS runtime error spikes.
- Track conversion path:
  - product list -> product detail
  - product detail -> cart
  - cart -> checkout

## Security

- Alert on repeated unauthorized attempts to admin endpoints.
- Track verification approve/reject actions in audit stream.
