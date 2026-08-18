-- 003 · Identity & access (Database Architecture §3).

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  base_currency char(3) NOT NULL DEFAULT 'USD',
  fiscal_year_start_month smallint NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  billing_email citext,
  settings jsonb,
  status org_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SELECT install_touch_trigger('organizations');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  email citext NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  auth_provider auth_provider NOT NULL,
  password_hash text,
  mfa_enabled boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  status user_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SELECT install_touch_trigger('users');

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid REFERENCES organizations(id),
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id, key)
);
CREATE INDEX ix_roles_org ON roles (organization_id);
SELECT install_touch_trigger('roles');

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  key text NOT NULL UNIQUE,
  domain text NOT NULL,
  description text,
  is_sensitive boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
SELECT install_touch_trigger('permissions');

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id),
  permission_id uuid NOT NULL REFERENCES permissions(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
CREATE INDEX ix_role_permissions_permission ON role_permissions (permission_id);
SELECT install_touch_trigger('role_permissions');

CREATE TABLE user_org_roles (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  user_id uuid NOT NULL REFERENCES users(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  location_scope location_scope_type NOT NULL DEFAULT 'all',
  invited_by uuid REFERENCES users(id),
  status membership_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organization_id, role_id)
);
CREATE INDEX ix_user_org_roles_org ON user_org_roles (organization_id);
CREATE INDEX ix_user_org_roles_user ON user_org_roles (user_id);
SELECT install_touch_trigger('user_org_roles');
