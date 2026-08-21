-- Refunds join the POS day summary (Clover reports them net of tax, and
-- subtracts refunded tax from the day's taxes). New formula:
--   net_sales = gross_sales − discounts − comps − refunds

ALTER TABLE pos_sales ADD COLUMN refunds numeric(14,2) NOT NULL DEFAULT 0;

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
   WHERE conrelid = 'pos_sales'::regclass AND contype = 'c'
     AND pg_get_constraintdef(oid) LIKE '%net_sales%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE pos_sales DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE pos_sales ADD CONSTRAINT pos_sales_net_formula
  CHECK (net_sales = gross_sales - discounts - comps - refunds);
