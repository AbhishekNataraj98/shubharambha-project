-- Financial agreement for each project
CREATE TABLE IF NOT EXISTS project_financials (
  id                           uuid PRIMARY KEY
                               DEFAULT gen_random_uuid(),
  project_id                   uuid NOT NULL
                               REFERENCES projects(id)
                               ON DELETE CASCADE,
  total_contract_amount        numeric NOT NULL,
  built_up_area_sqft           numeric NOT NULL,
  number_of_floors             text NOT NULL
                               CHECK (number_of_floors IN
                               ('G','G+1','G+2','G+3')),
  start_date                   date NOT NULL,
  expected_end_date            date NOT NULL,
  agreed_cement_rate           numeric DEFAULT 400,
  agreed_steel_rate            numeric DEFAULT 65,
  escalation_threshold_percent numeric DEFAULT 10,
  payment_schedule             jsonb NOT NULL DEFAULT '[]',
  category_budget              jsonb,
  created_at                   timestamptz DEFAULT now(),
  updated_at                   timestamptz DEFAULT now(),
  UNIQUE(project_id)
);

-- Weekly material price tracking
CREATE TABLE IF NOT EXISTS material_price_updates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id)
               ON DELETE CASCADE,
  cement_rate  numeric,
  steel_rate   numeric,
  recorded_by  uuid REFERENCES users(id),
  recorded_at  timestamptz DEFAULT now()
);

ALTER TABLE project_financials
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_price_updates
  ENABLE ROW LEVEL SECURITY;

-- project_financials policies
CREATE POLICY "project parties view financials"
ON project_financials FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_financials.project_id
    AND (p.customer_id = auth.uid()
      OR p.contractor_id = auth.uid())
  )
);

CREATE POLICY "customer inserts financials"
ON project_financials FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_financials.project_id
    AND p.customer_id = auth.uid()
  )
);

CREATE POLICY "customer updates financials"
ON project_financials FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = project_financials.project_id
    AND p.customer_id = auth.uid()
  )
);

-- material_price_updates policies
CREATE POLICY "project parties view prices"
ON material_price_updates FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = material_price_updates.project_id
    AND (p.customer_id = auth.uid()
      OR p.contractor_id = auth.uid())
  )
);

CREATE POLICY "project parties insert prices"
ON material_price_updates FOR INSERT
WITH CHECK (
  recorded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = material_price_updates.project_id
    AND (p.customer_id = auth.uid()
      OR p.contractor_id = auth.uid())
  )
);

-- Default payment schedule for G+2 construction
-- (from actual Indian construction agreement)
COMMENT ON TABLE project_financials IS
'Stores financial agreement details per project.
Payment schedule follows standard Indian construction
agreement percentages.';
