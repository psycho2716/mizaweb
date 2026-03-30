-- Seller quality checklist snapshot (saved when order moves to confirmed; visible to buyer).
alter table public.app_orders
  add column if not exists quality_checklist jsonb;

comment on column public.app_orders.quality_checklist is
  'JSON object: itemMatchesListing, packingProtectsEdges, labelIncludesOrderId (booleans); set when seller confirms order.';
