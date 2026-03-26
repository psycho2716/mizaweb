# Deployment

## Environments

- Development: local apps (`frontend`, `backend`) with `.env.local` and `.env`.
- Staging: mirror production infra with separate Supabase project.
- Production: isolated Supabase project and locked secrets.

## Backend rollout

1. Apply migration set in `supabase/migrations`.
2. Deploy backend service with environment variables from `backend/.env.example`.
3. Run smoke checks:
   - `GET /health`
   - Verification submit/approve/reject flow
   - Product publish restriction for unverified seller

## Frontend rollout

1. Set public environment variables from `frontend/.env.local.example`.
2. Deploy frontend build.
3. Verify buyer/seller/admin routing and API connectivity.

## Release checklist

- CI green for backend and frontend.
- Migrations applied in order.
- Signed URL access enforced for `verification-docs`.
- Monitoring alerts enabled for 5xx and latency spikes.
