# AI-Powered Stone E-Commerce Platform Build Plan

## 1. Project Objective

Build a production-ready AI-powered e-commerce platform where seller users can post any stone products, buyers can discover and customize listings, and admin users can verify seller legitimacy via submitted business permits before allowing public publishing.

Core architecture is strictly separated:

- Frontend: Next.js (latest) + TailwindCSS + ShadCN UI + Sonner + Lucide Icons
- Backend API: Node.js + Express.js + Socket.IO
- Backend service/database: Supabase (Postgres, Auth, Storage, RLS)
- External APIs: Google Maps API, Directions API, Fal AI

---

## 2. Product Scope (Open Listing Model)

The platform does not enforce fixed product taxonomy (no required category/material/barangay fields). Sellers define product metadata freely through structured and semi-structured fields.

### 2.1 User Roles

- Buyer
  - Browse/search listings
  - Customize products where enabled
  - Place and track orders
  - Receive AI guidance and recommendations
- Seller
  - Create/edit product listings
  - Upload product media
  - Manage customization options and orders
  - Submit business permit for account verification
- Admin
  - Verify seller accounts via business permit review
  - Moderate listings and users
  - Manage trust/safety and platform analytics

### 2.2 Seller Verification Requirement

- Seller accounts begin as `unverified`.
- Unverified sellers can create/edit draft listings but cannot publish publicly.
- Admin review process:
  - `approve` -> seller becomes verified and can publish.
  - `reject` -> seller receives reason and can resubmit.

### 2.3 UI/UX Direction (Modern, Minimal, Impactful)

The platform UI/UX must follow modern e-commerce best practices with a minimalist visual language that still feels premium and conversion-focused.

- Visual approach
  - Clean layouts with strong whitespace and clear visual hierarchy
  - Neutral base palette with focused accent colors for actions and status
  - High-quality product media as the primary visual storytelling element
  - Limited decorative effects; motion used only for meaningful feedback
- UX principles
  - Mobile-first responsive design and thumb-friendly interactions
  - Fast, scannable product cards and product detail pages
  - Frictionless checkout (guest-first option, fewer fields, clear steps)
  - Trust-first UX (clear pricing, lead times, seller verification badge, return policies)
  - Accessibility-first standards (contrast, keyboard support, semantic markup, ARIA)
- Conversion-focused product page standards
  - Above-the-fold: product media, title, price, key specs, CTA
  - Immediate visibility for customization options and price changes
  - Structured descriptions with concise bullets and expandable detailed specs
  - Social proof placement (ratings/reviews) near primary purchase area
- Design system strategy
  - Build reusable component system with ShadCN UI primitives
  - Define typography scale, spacing scale, and component states early
  - Standardize feedback patterns (loading, empty, error, success)
  - Enforce consistency across buyer, seller, and admin experiences

### 2.4 Project Color Theme and Visual Identity

The platform must implement a consistent color scheme/theme aligned with the stone e-commerce purpose: natural, premium, trustworthy, and modern.

- Theme intent
  - Reflect natural stone character (earth/mineral inspired tones)
  - Preserve a clean and minimalist visual style
  - Maintain strong readability and accessibility
- Recommended palette direction
  - Primary: slate/charcoal tones for stability and premium feel
  - Secondary: warm stone neutrals (sand, limestone-inspired grays)
  - Accent: restrained deep green or muted blue for actions and highlights
  - Semantic states: clear success, warning, destructive, and info colors
- Theme implementation
  - Define design tokens (CSS variables) for light and dark themes
  - Map tokens to ShadCN theme variables for component consistency
  - Keep CTA and status colors consistent across all dashboards and pages
- Accessibility and quality gates
  - Enforce WCAG-compliant contrast ratios for text and controls
  - Validate color usage in both light and dark modes
  - Avoid over-saturated accents; prioritize calm, premium presentation

---

## 3. Target System Architecture

Separation of concerns is mandatory across the repository:

- `frontend/` contains only the Next.js project, responsible for UI/UX and frontend interaction logic.
- `backend/` contains only the Express.js API, responsible for server-side business logic, orchestration, security, and realtime events.
- Supabase is the centralized data and file storage layer, accessed through backend services and controlled policies.

## 3.1 Frontend (`frontend/`)

- Next.js latest App Router
- TailwindCSS for styling foundation
- ShadCN UI as the component system foundation
- Sonner for toast notifications and async user feedback
- Lucide icons for consistent iconography
- Public storefront and product pages
- Buyer dashboard: cart, checkout, orders
- Seller dashboard: listings, media, orders, verification status
- Admin dashboard: verification queue, moderation, operations
- Optional 3D visualization (Three.js in client components)
- Realtime updates with Socket.IO client

## 3.2 Backend (`backend/`)

- Express.js REST API for business logic and validation
- Socket.IO for realtime order and admin notifications
- AI orchestration endpoints for guidance/recommendations
- Google Maps and Directions API helper endpoints to protect API keys
- Role-based middleware for auth and access control

## 3.3 Supabase

- Auth and role-bound profile data
- Postgres data model + migrations
- Private and public storage buckets
- Row Level Security policies
- Auditable lifecycle for sensitive actions

### 3.4 Integration Responsibilities (Contract)

- Frontend -> Backend
  - The frontend never contains privileged secrets and consumes backend API for protected operations.
- Backend -> Supabase
  - Backend enforces business rules and role checks, then performs database and storage operations.
- Backend -> Google APIs
  - Backend proxies route/direction requests for seller store location and delivery route context.
- Backend <-> Frontend Realtime
  - Socket.IO events are emitted by backend and consumed by frontend clients.

---

## 4. Functional Modules

## 4.1 Account, Auth, and Authorization

- Signup/login/logout and profile management
- Role assignment and role-guarded routes
- Middleware-based access enforcement in backend and frontend

## 4.2 Seller Verification Workflow

- Seller uploads business permit document
- Submission enters admin queue as `pending`
- Admin can approve/reject with notes
- Seller can resubmit after rejection
- Publishing listings blocked until verification is approved

## 4.3 Product Listing Management

- Create/update/delete listing drafts
- Publish/unpublish if seller verified
- Flexible listing schema:
  - title, description, base price
  - dimensions/specs JSON fields
  - tags/keywords
  - stock mode and lead time

## 4.4 Media and Visualization

- Image gallery upload and ordering
- Optional model asset upload for 3D preview
- Fallback to image-first UX when 3D not available

## 4.5 Discovery and Search

- Full-text search over title/description/tags/specs
- Sort by relevance, recent, price, rating
- Filters: customizable only, stock mode, price range

## 4.6 Customization and Pricing Rules

- Seller-defined customization options (size, finish, edge style, notes)
- Backend validation rules for limits and allowed values
- Dynamic pricing adjustments based on configured rules

## 4.7 Cart, Checkout, and Orders

- Cart and cart items with customization snapshot
- Checkout and order creation
- Order status lifecycle with history tracking
- Seller fulfillment actions and buyer tracking

## 4.8 AI Guidance and Recommendations

- Intent-based guidance assistant
- Recommendation ranking based on listing relevance and behavior
- Fal AI optional integration for enhanced visual workflows

## 4.9 Maps and Delivery Intelligence

- Address mapping and route visualization
- Delivery estimate support via Directions API

## 4.10 Admin Operations and Trust & Safety

- Seller verification queue
- Listing moderation queue
- Dispute handling and incident logs
- Audit and monitoring tools

---

## 5. Data Model Plan (Supabase)

Database setup must be robust, migration-driven, and production-safe from day one.

## 5.1 Core Tables

- `profiles` (user role + base profile fields)
- `seller_profiles` (shop details + verification state)
- `seller_verification_submissions` (business permit records)
- `products`
- `product_media`
- `customization_options`
- `customization_rules`
- `carts`
- `cart_items`
- `orders`
- `order_items`
- `order_customizations`
- `order_status_history`
- `reviews`
- `recommendation_events`
- `ai_requests`
- `notifications`
- `reports_disputes`
- `audit_logs`

## 5.2 Verification Columns and Constraints

- `seller_profiles.verification_status` enum:
  - `unsubmitted`, `pending`, `approved`, `rejected`
- `seller_profiles.verified_at`, `seller_profiles.verified_by`
- `seller_profiles.rejection_reason`
- `seller_verification_submissions.status` enum:
  - `pending`, `approved`, `rejected`

Publishing constraint:

- Product publish operation must fail unless seller is `approved`.

## 5.3 Storage Buckets

- `product-media` (public or controlled read as needed)
- `verification-docs` (private, signed URLs only)

## 5.4 Robust Database Setup Requirements

- Migration-first schema management
  - Use versioned SQL migrations only; no manual schema drift in production.
  - Every schema change must be reversible or accompanied by rollback instructions.
- Data integrity controls
  - Strong foreign keys, check constraints, and unique constraints on critical business fields.
  - Use transaction boundaries for multi-table writes (order creation, status transition, verification updates).
- Performance and indexing
  - Add targeted indexes for search, listing retrieval, and order timelines.
  - Review query plans for heavy endpoints before release.
- Security and RLS hardening
  - Apply least-privilege RLS policies per role and ownership.
  - Keep sensitive tables and permit docs private by default.
- Reliability and recovery
  - Daily automated backups and tested restore procedure in staging.
  - Audit triggers/logging for privileged admin actions.
- Operational hygiene
  - Seed scripts for non-production environments.
  - Clear data retention and archival policy for logs, notifications, and AI events.

---

## 6. API Plan (Express)

## 6.1 Auth and Profile

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`

## 6.2 Seller Verification

- Seller:
  - `POST /seller/verification/submit`
  - `GET /seller/verification/status`
  - `POST /seller/verification/resubmit`
- Admin:
  - `GET /admin/verifications?status=pending`
  - `GET /admin/verifications/:id`
  - `POST /admin/verifications/:id/approve`
  - `POST /admin/verifications/:id/reject`

## 6.3 Product and Media

- `POST /products`
- `PATCH /products/:id`
- `POST /products/:id/publish`
- `POST /products/:id/unpublish`
- `GET /products`
- `GET /products/:id`
- `POST /products/:id/media`
- `DELETE /products/:id/media/:mediaId`

## 6.4 Customization

- `POST /products/:id/customization-options`
- `PATCH /products/:id/customization-options/:optionId`
- `POST /products/:id/customization-rules`
- `POST /products/:id/price-preview`

## 6.5 Cart and Checkout

- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:itemId`
- `DELETE /cart/items/:itemId`
- `POST /checkout`

## 6.6 Orders

- `GET /orders`
- `GET /orders/:id`
- `POST /orders/:id/status`

## 6.7 AI and Recommendations

- `POST /ai/guidance`
- `GET /recommendations`
- `POST /ai/fal/jobs`
- `GET /ai/fal/jobs/:jobId`

## 6.8 Maps

- `POST /maps/geocode`
- `POST /maps/directions`

---

## 7. Realtime Plan (Socket.IO)

Channels:

- `order:{orderId}`
- `buyer:{buyerId}:notifications`
- `seller:{sellerId}:orders`
- `admin:verifications`
- `admin:moderation`

Events:

- Order status changed
- Verification submitted/approved/rejected
- AI job status updates

---

## 8. Security and Compliance Baseline

- Enforce Supabase RLS for all user-owned and admin-sensitive data
- Backend-only handling of API secrets (Google/Fal)
- Input validation with strict schemas
- Rate limiting on auth, search, AI, and upload endpoints
- Private handling of permit documents
- Full audit logging for admin verification decisions
- Structured errors and request correlation IDs

---

## 9. Delivery Roadmap (12 Weeks)

## Phase 0 (Week 1): Foundation

- Repo structure setup (`frontend/`, `backend/`)
- Environment and secrets management
- CI/CD baseline (lint, typecheck, test hooks)
- Supabase base schema and migration tooling

Exit criteria:

- Frontend and backend deployable to staging with health checks.

## Phase 1 (Weeks 2-3): Auth + Seller Verification + Listing Core

- Auth and role setup
- Seller verification submission flow
- Admin verification queue and review actions
- Listing draft CRUD and publish restriction by verification status
- Media upload baseline

Exit criteria:

- Verified sellers can publish; unverified sellers cannot.

## Phase 2 (Weeks 4-5): Discovery + Product Detail + Customization

- Search and listing retrieval APIs
- Product detail UX with rich media
- Customization options and validation
- Dynamic price preview endpoint

Exit criteria:

- Buyer can find listings and configure custom options with valid pricing.

## Phase 3 (Weeks 6-7): Cart + Checkout + Orders + Realtime

- Cart operations
- Checkout and order creation
- Order state machine and status history
- Socket.IO order notifications

Exit criteria:

- End-to-end order lifecycle works from add-to-cart to fulfillment updates.

## Phase 4 (Weeks 8-9): AI Guidance + Recommendations

- Guidance prompt flow and recommendation endpoint
- Event tracking for recommendation quality
- Fal AI optional job pipeline and status retrieval

Exit criteria:

- AI-assisted discovery is operational and measurable.

## Phase 5 (Weeks 10-11): 3D Optional + Maps Integration

- 3D viewer integration where assets exist
- Maps and route estimate support
- Fallback behavior and UX hardening

Exit criteria:

- Visual and logistics enhancements are stable in staging.

## Phase 6 (Week 12): Hardening and Launch

- Security testing and performance pass
- UAT, bug triage, release checklist
- Monitoring, alerting, and runbooks
- Production rollout and post-launch observation

Exit criteria:

- Production release completed with operational safeguards.

---

## 10. Testing Strategy

- Unit tests: service logic, validation rules, pricing calculations
- Integration tests: API endpoints + auth/role guards
- E2E tests: seller verification flow, listing publish flow, checkout flow
- Security tests: RLS behavior, unauthorized access attempts
- Load tests: search, product detail, checkout, websocket event bursts

---

## 11. Go-Live Checklist

- All critical routes protected by role middleware
- Seller verification gate enforced in publish endpoint
- Permit docs inaccessible publicly
- Migrations applied and rollback plan validated
- Error tracking and uptime alerts enabled
- Staging sign-off and production smoke tests completed

---

## 12. Success Metrics

- Seller verification turnaround time
- Verified seller conversion rate
- Listing publish success rate
- Search-to-product-click rate
- Customization completion rate
- Checkout completion rate
- Order fulfillment lead time
- Repeat buyer rate

---

## 13. UI/UX Inspiration and Benchmark References

Use these as inspiration and benchmarking references while keeping your own brand direction:

- Design galleries and inspiration
  - [Awwwards - E-commerce](https://www.awwwards.com/websites/e-commerce/)
  - [Dribbble - Ecommerce Website](https://dribbble.com/tags/ecommerce_website)
  - [Behance - E-commerce UI](https://www.behance.net/search/projects?search=ecommerce%20ui)
  - [Commerce Cream](https://commercecream.com/)
  - [eComm.design](https://ecomm.design/)
- UX and conversion best-practice references
  - [Baymard Institute](https://baymard.com/)
  - [Nielsen Norman Group](https://www.nngroup.com/topic/ecommerce/)
- Design system and implementation references
  - [Shopify Polaris](https://polaris.shopify.com/)
  - [ShadCN UI](https://ui.shadcn.com/)

### 13.1 How to Use Inspiration Properly

- Extract patterns, not exact copies
- Maintain consistency with your product's trust-first flow
- Prioritize readability and clarity over ornamental complexity
- Validate design decisions through usability tests and conversion metrics

---

## 14. Implementation Folder Tree Blueprint

Use this as the required baseline structure before building features.

## 14.1 Repository Root

```txt
mizaweb/
  frontend/                 # Next.js app (UI only)
  backend/                  # Express.js API (server logic only)
  supabase/                 # DB migrations, seeds, policies, storage docs
  docs/                     # Architecture, API specs, runbooks
  .env.example
  README.md
```

## 14.2 Frontend Tree (`frontend/`)

```txt
frontend/
  app/
    (public)/
      page.tsx
      products/
        page.tsx
        [slug]/
          page.tsx
    (buyer)/
      cart/
        page.tsx
      checkout/
        page.tsx
      orders/
        page.tsx
        [id]/
          page.tsx
    (seller)/
      dashboard/
        page.tsx
      listings/
        page.tsx
        new/
          page.tsx
        [id]/
          page.tsx
      orders/
        page.tsx
      verification/
        page.tsx
    (admin)/
      dashboard/
        page.tsx
      verifications/
        page.tsx
        [id]/
          page.tsx
      moderation/
        page.tsx
    auth/
      login/
        page.tsx
      register/
        page.tsx
    api/                    # Optional Next route handlers for frontend-only concerns
  components/
    ui/                     # ShadCN primitives
    product/
    listing/
    checkout/
    seller/
    admin/
    maps/
    feedback/               # Sonner wrappers, empty/error states
  features/
    catalog/
    customization/
    recommendations/
    verification/
    orders/
  hooks/
  lib/
    api/
      client.ts
      endpoints.ts
    auth/
    utils/
    validations/
  providers/
  styles/
  types/
    api.ts
    auth.ts
    product.ts
    order.ts
    admin.ts
    ui.ts
    common.ts
    index.ts
  public/
  tests/
```

Frontend guardrails:

- UI and interaction logic only; no direct privileged database operations.
- All server data mutations go through `backend` API.
- Use TailwindCSS + ShadCN UI for consistent design system.
- Use Sonner for toast feedback and Lucide icons for iconography.

## 14.3 Backend Tree (`backend/`)

```txt
backend/
  src/
    index.ts
    app.ts
    config/
      env.ts
      cors.ts
      rate-limit.ts
      socket.ts
    modules/
      auth/
        auth.routes.ts
        auth.controller.ts
        auth.service.ts
        auth.schemas.ts
      users/
      sellers/
      verification/
        verification.routes.ts
        verification.controller.ts
        verification.service.ts
        verification.repository.ts
      products/
      media/
      customization/
      cart/
      checkout/
      orders/
      recommendations/
      ai/
      maps/
      admin/
    middleware/
      authenticate.ts
      authorize-role.ts
      validate-request.ts
      error-handler.ts
      not-found.ts
    integrations/
      supabase/
        client.ts
        storage.ts
      google/
        maps.ts
        directions.ts
      fal/
        client.ts
    sockets/
      io.ts
      channels.ts
      events.ts
    lib/
      logger.ts
      errors.ts
      response.ts
      pagination.ts
    types/
      api.ts
      domain.ts
      socket.ts
    jobs/
      ai-jobs.ts
      cleanup-jobs.ts
  tests/
    unit/
    integration/
    e2e/
  package.json
  tsconfig.json
```

Backend guardrails:

- Backend owns business rules, data writes, integration calls, and Socket.IO emission.
- Keep route/controller/service/repository separation for maintainability.
- Protect Google Maps/Directions and Fal AI keys in backend only.

## 14.4 Supabase Tree (`supabase/`)

```txt
supabase/
  migrations/
    0001_init.sql
    0002_auth_profiles.sql
    0003_seller_verification.sql
    0004_products_and_media.sql
    0005_customization_rules.sql
    0006_orders_and_history.sql
    0007_recommendations_ai_events.sql
    0008_indexes_and_perf.sql
    0009_rls_policies.sql
  seeds/
    dev_seed.sql
    staging_seed.sql
  policies/
    README.md
  storage/
    README.md              # bucket strategy: product-media, verification-docs
```

Supabase guardrails:

- Migrations are the only source of truth for schema changes.
- `verification-docs` bucket is private; use signed URLs only.
- RLS policies must be reviewed per release.

## 14.5 Docs Tree (`docs/`)

```txt
docs/
  architecture/
    system-overview.md
    sequence-flows.md
  api/
    openapi.yaml
    endpoint-contracts.md
  database/
    schema-diagram.md
    rls-matrix.md
  ui-ux/
    design-system.md
    ux-checklist.md
  operations/
    deployment.md
    monitoring-alerts.md
    incident-response.md
```

## 14.6 Naming and Module Conventions

- File naming
  - `kebab-case` for files/folders, except React components (`PascalCase` when needed).
- Backend module boundaries
  - Each module should own its routes, controller, service, and repository.
- Shared DTO and validation
  - Keep request/response validation schemas close to module routes.
- Type organization
  - Keep frontend types in `frontend/types/` with domain files and barrel exports.

## 14.7 Immediate Setup Checklist

- Create `frontend/`, `backend/`, `supabase/`, and `docs/` folders.
- Initialize Next.js in `frontend/` and Express TypeScript app in `backend/`.
- Add Supabase migration baseline and seed scaffolding.
- Add linting, formatting, and test configuration in both apps.
- Add environment templates for root, frontend, and backend.

---

## 15. Scaffold Commands (Implementation Kickoff)

Run these commands from repository root (`mizaweb/`).

## 15.1 Create Core Folders

```bash
mkdir frontend backend supabase docs
```

## 15.2 Initialize Frontend (Next.js + Tailwind + ShadCN + Sonner + Lucide)

```bash
npx create-next-app@latest frontend --typescript --eslint --tailwind --app --src-dir=false --import-alias "@/*"
cd frontend
npx shadcn@latest init -d
npm install sonner lucide-react socket.io-client @supabase/supabase-js zod react-hook-form @hookform/resolvers
npm install three @react-three/fiber @react-three/drei
cd ..
```

## 15.3 Initialize Backend (Express + TypeScript + Socket.IO)

```bash
cd backend
npm init -y
npm install express cors helmet morgan socket.io zod dotenv @supabase/supabase-js jsonwebtoken
npm install express-rate-limit cookie-parser
npm install -D typescript tsx @types/node @types/express @types/cors @types/morgan @types/cookie-parser @types/jsonwebtoken eslint prettier
npx tsc --init
cd ..
```

## 15.4 Initialize Supabase Project Structure

```bash
mkdir supabase/migrations supabase/seeds supabase/policies supabase/storage
```

Create baseline files:

```bash
touch supabase/migrations/0001_init.sql
touch supabase/migrations/0002_auth_profiles.sql
touch supabase/migrations/0003_seller_verification.sql
touch supabase/migrations/0004_products_and_media.sql
touch supabase/migrations/0005_customization_rules.sql
touch supabase/migrations/0006_orders_and_history.sql
touch supabase/migrations/0007_recommendations_ai_events.sql
touch supabase/migrations/0008_indexes_and_perf.sql
touch supabase/migrations/0009_rls_policies.sql
touch supabase/seeds/dev_seed.sql
touch supabase/seeds/staging_seed.sql
touch supabase/policies/README.md
touch supabase/storage/README.md
```

## 15.5 Backend Base Scripts (`backend/package.json`)

Add these scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "echo \"Add tests\""
  }
}
```

## 15.6 Frontend Base Scripts (`frontend/package.json`)

Ensure these scripts exist:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

## 15.7 Environment Templates

Root `.env.example`:

```env
# Shared
NODE_ENV=development
```

`frontend/.env.local.example`:

```env
NEXT_PUBLIC_APP_NAME=Romblon Stone Marketplace
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_browser_key
```

`backend/.env.example`:

```env
PORT=4000
FRONTEND_URL=http://localhost:3000
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
JWT_SECRET=your_jwt_secret
GOOGLE_MAPS_API_KEY=your_google_maps_server_key
GOOGLE_DIRECTIONS_API_KEY=your_google_directions_server_key
FAL_API_KEY=your_fal_api_key
```

## 15.8 First Run Commands

Terminal 1:

```bash
cd backend
npm run dev
```

Terminal 2:

```bash
cd frontend
npm run dev
```

## 15.9 Post-Scaffold Validation

- Frontend loads on `http://localhost:3000`
- Backend health route loads on `http://localhost:4000/health`
- Frontend can call backend test route successfully
- Supabase credentials read correctly in both apps
- Sonner toasts and ShadCN components render correctly

