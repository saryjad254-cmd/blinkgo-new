-- Cover foreign keys used by high-traffic operational and reconciliation flows.
-- Names are explicit and every statement is safe to rerun.

create index if not exists group_orders_restaurant_id_idx on public.group_orders (restaurant_id);
create index if not exists group_orders_completed_order_id_idx on public.group_orders (completed_order_id);
create index if not exists group_order_participants_user_id_idx on public.group_order_participants (user_id);
create index if not exists group_order_items_product_id_idx on public.group_order_items (product_id);

create index if not exists order_delivery_proofs_driver_id_idx on public.order_delivery_proofs (driver_id);
create index if not exists order_failed_deliveries_driver_id_idx on public.order_failed_deliveries (driver_id);
create index if not exists order_failed_deliveries_resolved_by_idx on public.order_failed_deliveries (resolved_by);

create index if not exists order_financial_adjustments_order_id_idx on public.order_financial_adjustments (order_id);
create index if not exists order_financial_adjustments_payment_refund_id_idx on public.order_financial_adjustments (payment_refund_id);
create index if not exists order_item_replacements_original_product_id_idx on public.order_item_replacements (original_product_id);
create index if not exists order_item_replacements_replacement_product_id_idx on public.order_item_replacements (replacement_product_id);
create index if not exists order_item_replacements_proposed_by_idx on public.order_item_replacements (proposed_by);
create index if not exists order_item_replacements_responded_by_idx on public.order_item_replacements (responded_by);

create index if not exists financial_documents_created_by_idx on public.financial_documents (created_by);
create index if not exists financial_documents_superseded_by_idx on public.financial_documents (superseded_by);
create index if not exists financial_journals_created_by_idx on public.financial_journals (created_by);
create index if not exists merchant_payouts_created_by_idx on public.merchant_payouts (created_by);
create index if not exists restaurant_special_hours_created_by_idx on public.restaurant_special_hours (created_by);
