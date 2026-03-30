-- quality_checklist JSON is now { "items": [ { "id", "label", "checked" } ] }; legacy flat booleans still supported in app parsers.
comment on column public.app_orders.quality_checklist is
  'JSON: { items: [{ id, label, checked }] } set when seller confirms; legacy { itemMatchesListing, packingProtectsEdges, labelIncludesOrderId } still read.';
