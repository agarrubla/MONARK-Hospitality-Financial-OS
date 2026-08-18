-- 019 · RBAC seed: static permission catalog + system roles.
-- Deny by default: nothing is grantable that isn't in this catalog.

INSERT INTO permissions (key, domain, description, is_sensitive) VALUES
  ('invoice.read',            'invoice', 'View invoices and line items',                        false),
  ('invoice.create',          'invoice', 'Create and edit draft invoices',                      false),
  ('invoice.approve',         'invoice', 'Approve invoices (never one''s own)',                 false),
  ('invoice.void',            'invoice', 'Void an unpaid invoice',                              false),
  ('payment.initiate',        'payment', 'Create outbound payments',                            false),
  ('payment.schedule',        'payment', 'Schedule payment dates',                              false),
  ('payment.approve',         'payment', 'Approve outbound payments',                           true),
  ('bank.view',               'bank',    'View bank accounts (masks) and transactions',         false),
  ('bank.admin',              'bank',    'Connect or modify bank integrations',                 true),
  ('vendor.read',             'vendor',  'View vendors',                                        false),
  ('vendor.read_remittance',  'vendor',  'Decrypt vendor remittance details',                   true),
  ('report.read',             'report',  'View P&L, cash flow and analytics',                   false),
  ('period.lock',             'period',  'Lock and unlock financial periods',                   true),
  ('budget.edit',             'budget',  'Create and edit budgets',                             false),
  ('ai.action',               'ai',      'Act on AI proposals (accept/dismiss)',                false),
  ('audit.read',              'audit',   'Read the audit log',                                  false),
  ('org.admin',               'org',     'Manage organization settings',                        true),
  ('role.manage',             'org',     'Grant and revoke roles',                              true);

INSERT INTO roles (organization_id, key, name, description, is_system) VALUES
  (NULL, 'owner',      'Owner',      'Full control, including role grants and the owner approval tier', true),
  (NULL, 'cfo',        'CFO',        'Full financial control',                                          true),
  (NULL, 'controller', 'Controller', 'Close, audit, approvals, treasury',                               true),
  (NULL, 'gm',         'GM',         'Location operations: invoices, reports',                          true),
  (NULL, 'ap_clerk',   'AP Clerk',   'Invoice entry and payment initiation',                            true),
  (NULL, 'viewer',     'Viewer',     'Read-only reports and invoices',                                  true);

WITH role_perm (role_key, perm_key) AS (
  VALUES
    -- owner: everything
    ('owner', 'invoice.read'), ('owner', 'invoice.create'), ('owner', 'invoice.approve'),
    ('owner', 'invoice.void'), ('owner', 'payment.initiate'), ('owner', 'payment.schedule'),
    ('owner', 'payment.approve'), ('owner', 'bank.view'), ('owner', 'bank.admin'),
    ('owner', 'vendor.read'), ('owner', 'vendor.read_remittance'), ('owner', 'report.read'),
    ('owner', 'period.lock'), ('owner', 'budget.edit'), ('owner', 'ai.action'),
    ('owner', 'audit.read'), ('owner', 'org.admin'), ('owner', 'role.manage'),
    -- cfo: everything but org/role administration
    ('cfo', 'invoice.read'), ('cfo', 'invoice.create'), ('cfo', 'invoice.approve'),
    ('cfo', 'invoice.void'), ('cfo', 'payment.initiate'), ('cfo', 'payment.schedule'),
    ('cfo', 'payment.approve'), ('cfo', 'bank.view'), ('cfo', 'bank.admin'),
    ('cfo', 'vendor.read'), ('cfo', 'vendor.read_remittance'), ('cfo', 'report.read'),
    ('cfo', 'period.lock'), ('cfo', 'budget.edit'), ('cfo', 'ai.action'), ('cfo', 'audit.read'),
    -- controller
    ('controller', 'invoice.read'), ('controller', 'invoice.create'), ('controller', 'invoice.approve'),
    ('controller', 'invoice.void'), ('controller', 'payment.initiate'), ('controller', 'payment.schedule'),
    ('controller', 'payment.approve'), ('controller', 'bank.view'), ('controller', 'vendor.read'),
    ('controller', 'vendor.read_remittance'), ('controller', 'report.read'), ('controller', 'period.lock'),
    ('controller', 'budget.edit'), ('controller', 'ai.action'), ('controller', 'audit.read'),
    -- gm (location-scoped via user_org_roles.location_scope)
    ('gm', 'invoice.read'), ('gm', 'invoice.create'), ('gm', 'invoice.approve'),
    ('gm', 'report.read'), ('gm', 'bank.view'), ('gm', 'vendor.read'),
    -- ap_clerk
    ('ap_clerk', 'invoice.read'), ('ap_clerk', 'invoice.create'), ('ap_clerk', 'payment.initiate'),
    ('ap_clerk', 'payment.schedule'), ('ap_clerk', 'vendor.read'), ('ap_clerk', 'bank.view'),
    -- viewer
    ('viewer', 'invoice.read'), ('viewer', 'report.read'), ('viewer', 'bank.view')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM role_perm rp
  JOIN roles r ON r.key = rp.role_key AND r.organization_id IS NULL
  JOIN permissions p ON p.key = rp.perm_key;
