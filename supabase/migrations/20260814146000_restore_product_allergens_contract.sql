-- The product legal-information UI and validation contract persist a reviewed
-- list of allergens. The original legal-information migration added the review
-- flag and additives but omitted the allergens array itself.

alter table public.products
  add column if not exists allergens text[] not null default '{}';

comment on column public.products.allergens is
  'Merchant-provided allergen declarations reviewed through allergen_information_reviewed; displayed as plain text before purchase.';
