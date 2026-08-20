-- 021 · Add Belvo as a bank-aggregator provider.
-- The handoff spec only listed Plaid (US/CA/EU); the business also banks in
-- Latin America, where Belvo is the aggregator. Same adapter contract.
ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'belvo';
