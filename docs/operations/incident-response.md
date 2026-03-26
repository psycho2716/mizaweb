# Incident Response

## Severity levels

- P1: platform unavailable or data integrity risk
- P2: major feature degradation (checkout, verification, publish flow)
- P3: minor degradation with workaround

## First response

1. Confirm incident scope and timestamp.
2. Freeze releases while triaging.
3. Capture logs, recent deployments, and migration state.
4. Mitigate:
   - rollback service version, or
   - disable affected route group behind feature toggle.

## Post-incident

- Record root cause and timeline.
- Add regression tests and monitoring rules.
- Update runbooks.
