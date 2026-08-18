-- 004 · Org structure (Database Architecture §4) + user_location_access (§3.7).

CREATE TABLE restaurants (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  name text NOT NULL,
  concept_type concept_type,
  status active_closed_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX ix_restaurants_org ON restaurants (organization_id);
SELECT install_touch_trigger('restaurants');

CREATE TABLE locations (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id),
  name text NOT NULL,
  code text NOT NULL,
  timezone text NOT NULL,
  address jsonb,
  pos_provider pos_provider,
  opened_on date,
  status active_closed_status NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);
CREATE INDEX ix_locations_org ON locations (organization_id);
CREATE INDEX ix_locations_restaurant ON locations (restaurant_id);
SELECT install_touch_trigger('locations');

CREATE TABLE user_location_access (
  user_org_role_id uuid NOT NULL REFERENCES user_org_roles(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_org_role_id, location_id)
);
CREATE INDEX ix_user_location_access_location ON user_location_access (location_id);
SELECT install_touch_trigger('user_location_access');
