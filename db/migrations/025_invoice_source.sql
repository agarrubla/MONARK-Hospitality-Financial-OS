-- Sender address for invoices ingested from email (source = 'email_capture'),
-- so the approval flow can notify the vendor. The source column itself has
-- existed since 009 (invoice_source enum).
ALTER TABLE invoices ADD COLUMN source_email text;
