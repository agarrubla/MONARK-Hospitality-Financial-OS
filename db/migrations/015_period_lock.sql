-- 015 · Period locking (Database Architecture §9.1).
-- When a financial_periods row is locked, writes whose financial date falls
-- inside it are rejected; corrections go into the open period as reversals.
-- Payment-state maintenance (amount_paid backfill on an old invoice) and
-- match evidence linking are NOT financial writes — matches book nothing.

CREATE OR REPLACE FUNCTION is_period_locked(p_org uuid, p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM financial_periods
     WHERE organization_id = p_org
       AND status = 'locked'
       AND p_date BETWEEN starts_on AND ends_on)
$$;

CREATE OR REPLACE FUNCTION enforce_period_lock() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_old_date date;
  v_new_date date;
  v_financial_change boolean := true;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'invoices' THEN
      v_org := coalesce(NEW.organization_id, OLD.organization_id);
      v_old_date := CASE WHEN TG_OP <> 'INSERT' THEN OLD.expense_date END;
      v_new_date := CASE WHEN TG_OP <> 'DELETE' THEN NEW.expense_date END;
      IF TG_OP = 'UPDATE' THEN
        -- Only accrual-side changes are period-locked; payment-state
        -- maintenance on an old invoice is legitimate.
        v_financial_change :=
             NEW.expense_date IS DISTINCT FROM OLD.expense_date
          OR NEW.service_date IS DISTINCT FROM OLD.service_date
          OR NEW.invoice_date IS DISTINCT FROM OLD.invoice_date
          OR NEW.subtotal IS DISTINCT FROM OLD.subtotal
          OR NEW.tax IS DISTINCT FROM OLD.tax
          OR NEW.total IS DISTINCT FROM OLD.total
          OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
          OR NEW.location_id IS DISTINCT FROM OLD.location_id
          OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status = 'void');
      END IF;
    WHEN 'payments' THEN
      v_org := coalesce(NEW.organization_id, OLD.organization_id);
      v_old_date := CASE WHEN TG_OP <> 'INSERT' THEN OLD.payment_date END;
      v_new_date := CASE WHEN TG_OP <> 'DELETE' THEN NEW.payment_date END;
      IF TG_OP = 'UPDATE' THEN
        v_financial_change :=
             NEW.payment_date IS DISTINCT FROM OLD.payment_date
          OR NEW.amount IS DISTINCT FROM OLD.amount
          OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('settled', 'voided'));
      END IF;
    WHEN 'pos_sales' THEN
      v_org := coalesce(NEW.organization_id, OLD.organization_id);
      v_old_date := CASE WHEN TG_OP <> 'INSERT' THEN OLD.business_date END;
      v_new_date := CASE WHEN TG_OP <> 'DELETE' THEN NEW.business_date END;
    WHEN 'bank_transactions' THEN
      SELECT organization_id INTO v_org FROM bank_accounts
       WHERE id = coalesce(NEW.bank_account_id, OLD.bank_account_id);
      v_old_date := CASE WHEN TG_OP <> 'INSERT' THEN OLD.posted_at END;
      v_new_date := CASE WHEN TG_OP <> 'DELETE' THEN NEW.posted_at END;
      IF TG_OP = 'UPDATE' THEN
        -- Match linkage is evidence, not an entry; only categorization is
        -- a financial change on a bank transaction.
        v_financial_change := NEW.category_id IS DISTINCT FROM OLD.category_id;
      END IF;
    WHEN 'invoice_line_items' THEN
      SELECT organization_id, expense_date INTO v_org, v_new_date
        FROM invoices WHERE id = coalesce(NEW.invoice_id, OLD.invoice_id);
      v_old_date := v_new_date;
  END CASE;

  IF NOT v_financial_change THEN
    RETURN coalesce(NEW, OLD);
  END IF;
  IF v_new_date IS NOT NULL AND is_period_locked(v_org, v_new_date) THEN
    RAISE EXCEPTION 'period containing % is locked; corrections go into the open period as reversals', v_new_date;
  END IF;
  IF v_old_date IS NOT NULL AND v_old_date IS DISTINCT FROM v_new_date
     AND is_period_locked(v_org, v_old_date) THEN
    RAISE EXCEPTION 'period containing % is locked; corrections go into the open period as reversals', v_old_date;
  END IF;
  RETURN coalesce(NEW, OLD);
END $$;

CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE OR DELETE ON pos_sales
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE OR DELETE ON bank_transactions
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();
CREATE TRIGGER trg_period_lock BEFORE INSERT OR UPDATE OR DELETE ON invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION enforce_period_lock();

-- Unlocking is a sensitive action: period.lock permission + an approval row.
CREATE OR REPLACE FUNCTION financial_periods_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT app_has_permission('period.lock') THEN
      RAISE EXCEPTION 'permission denied: period.lock is required';
    END IF;
    IF OLD.status = 'locked' THEN
      IF NOT EXISTS (
        SELECT 1 FROM approvals
         WHERE subject_type = 'period_lock' AND subject_id = NEW.id
           AND decision = 'approved') THEN
        RAISE EXCEPTION 'unlocking a period requires an approved period_lock approval';
      END IF;
    END IF;
    IF NEW.status = 'locked' THEN
      NEW.locked_by := coalesce(NEW.locked_by, app_current_user());
      NEW.locked_at := coalesce(NEW.locked_at, now());
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_financial_periods_guard
  BEFORE UPDATE ON financial_periods
  FOR EACH ROW EXECUTE FUNCTION financial_periods_guard();
