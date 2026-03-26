# Mizaweb

Production scaffold for an AI-powered stone e-commerce platform.

## Run locally

1. Copy env templates:
   - `.env.example` to `.env`
   - `backend/.env.example` to `backend/.env`
   - `frontend/.env.local.example` to `frontend/.env.local`
2. Start backend:
   - `cd backend`
   - `npm run dev`
3. Start frontend:
   - `cd frontend`
   - `npm run dev`

## Demo users

- Buyer: `u-buyer-1`
- Seller: `u-seller-1`
- Admin: `u-admin-1`

Use request header `x-user-id` for protected backend endpoints.
