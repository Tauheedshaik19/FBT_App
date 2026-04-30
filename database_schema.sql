-- ==========================================
-- INVENTORY TRACKING & TECHNICIAN APP SCHEMA
-- ==========================================

-- 1. EXTENSIONS & BASICS
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_user_id UUID UNIQUE,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT DEFAULT 'technician',
    requested_role TEXT DEFAULT 'technician',
    specialty TEXT DEFAULT 'General',
    phone_number TEXT,
    status TEXT DEFAULT 'active',
    approval_status TEXT DEFAULT 'approved',
    approved_at TIMESTAMPTZ,
    approved_by UUID,
    is_superadmin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CLIENTS TABLE
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_name TEXT NOT NULL,
    company_name TEXT,
    industry TEXT,
    address TEXT,
    contact_person TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SITES TABLE
CREATE TABLE IF NOT EXISTS public.sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    latitude FLOAT,
    longitude FLOAT,
    address TEXT,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Schema drift repairs for older Supabase projects
ALTER TABLE IF EXISTS public.sites
    ADD COLUMN IF NOT EXISTS address TEXT;

-- 5. JOBS TABLE
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    job_type VARCHAR(100) DEFAULT 'General Work',
    status VARCHAR(50) DEFAULT 'Unassigned',
    priority VARCHAR(20) DEFAULT 'medium',
    estimated_duration_hours DECIMAL(5, 2) DEFAULT 2.0,
    scheduled_date DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by TEXT,
    protocol_number VARCHAR(100),
    job_card_numbers TEXT[] DEFAULT ARRAY[]::TEXT[],
    season VARCHAR(50),
    install_date DATE,
    uninstall_date DATE,
    handover_date DATE,
    report_completion_date DATE,
    report_result TEXT,
    report_status VARCHAR(50) DEFAULT 'Pending',
    technician_name VARCHAR(100),
    logger_qty INTEGER DEFAULT 1,
    duration VARCHAR(50),
    notes TEXT,
    qty INTEGER DEFAULT 1,
    workflow_module TEXT DEFAULT 'general',
    mapping_due_date DATE,
    work_pack_template_key TEXT,
    work_pack_tools TEXT,
    work_pack_scope TEXT,
    work_pack_generated_at TIMESTAMPTZ,
    work_pack_approved_at TIMESTAMPTZ,
    work_pack_approved_by TEXT
);

-- Schema drift repairs for older Supabase projects
ALTER TABLE IF EXISTS public.jobs
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS season VARCHAR(50),
    ADD COLUMN IF NOT EXISTS install_date DATE,
    ADD COLUMN IF NOT EXISTS uninstall_date DATE,
    ADD COLUMN IF NOT EXISTS handover_date DATE,
    ADD COLUMN IF NOT EXISTS report_completion_date DATE,
    ADD COLUMN IF NOT EXISTS report_result TEXT,
    ADD COLUMN IF NOT EXISTS report_status VARCHAR(50) DEFAULT 'Pending',
    ADD COLUMN IF NOT EXISTS technician_name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS logger_qty INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS duration VARCHAR(50),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS qty INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS workflow_module TEXT DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS mapping_due_date DATE,
    ADD COLUMN IF NOT EXISTS work_pack_template_key TEXT,
    ADD COLUMN IF NOT EXISTS work_pack_tools TEXT,
    ADD COLUMN IF NOT EXISTS work_pack_scope TEXT,
    ADD COLUMN IF NOT EXISTS work_pack_generated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS work_pack_approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS work_pack_approved_by TEXT;

-- 6. INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT,
    category TEXT,
    ch_number TEXT,
    serial_number TEXT UNIQUE NOT NULL,
    calibration_cert TEXT,
    calibration_cert_number TEXT,
    calibration_date TEXT, 
    re_calibration_date TEXT,
    status TEXT DEFAULT 'Booked In',
    condition_status TEXT DEFAULT 'Good',
    site_id UUID REFERENCES public.sites(id),
    current_site_name TEXT,
    current_customer TEXT,
    current_technician_name TEXT,
    current_protocol_number TEXT,
    last_movement_id TEXT,
    current_user_id UUID REFERENCES public.users(id),
    qty INTEGER DEFAULT 1,
    notes TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unified Inventory Constraints
ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_status_check;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_status_check 
CHECK (status IN (
    'Good', 'In Stock', 'Booked In', 'Booked Out', 'Warning', 'Faulty',
    'Damaged', 'Needs Maintenance', 'Maintenance Required', 'Missing', 'Critical'
));

ALTER TABLE public.inventory DROP CONSTRAINT IF EXISTS inventory_condition_status_check;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_condition_status_check
CHECK (condition_status IN (
    'Good', 'Faulty', 'Damaged', 'Needs Maintenance', 'Missing'
));

-- 7. INVENTORY LOGS
CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'Movement',
    old_status TEXT,
    new_status TEXT,
    performed_by TEXT,
    serial_number TEXT,
    asset_name TEXT,
    ch_number TEXT,
    customer_name TEXT,
    site_name TEXT,
    technician_name TEXT,
    protocol TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. APPLICATION ACTIVITY LOGS
CREATE TABLE IF NOT EXISTS public.app_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    username TEXT,
    user_email TEXT,
    user_role TEXT,
    event_type TEXT NOT NULL DEFAULT 'activity',
    module_name TEXT NOT NULL DEFAULT 'general',
    entity_type TEXT,
    entity_id TEXT,
    entity_label TEXT,
    action_summary TEXT NOT NULL,
    action_details TEXT,
    changed_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.app_activity_logs
    ADD COLUMN IF NOT EXISTS session_id TEXT,
    ADD COLUMN IF NOT EXISTS user_id UUID,
    ADD COLUMN IF NOT EXISTS username TEXT,
    ADD COLUMN IF NOT EXISTS user_email TEXT,
    ADD COLUMN IF NOT EXISTS user_role TEXT,
    ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'activity',
    ADD COLUMN IF NOT EXISTS module_name TEXT DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS entity_type TEXT,
    ADD COLUMN IF NOT EXISTS entity_id TEXT,
    ADD COLUMN IF NOT EXISTS entity_label TEXT,
    ADD COLUMN IF NOT EXISTS action_summary TEXT,
    ADD COLUMN IF NOT EXISTS action_details TEXT,
    ADD COLUMN IF NOT EXISTS changed_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS occurred_at TIMESTAMPTZ DEFAULT NOW();

-- 9. JOB ASSIGNMENT REQUESTS
DO $$ 
DECLARE
    jobs_id_type TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod) INTO jobs_id_type
    FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'jobs' AND a.attname = 'id' AND a.attnum > 0;

    IF jobs_id_type IS NULL THEN jobs_id_type := 'UUID'; END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_assignment_requests') THEN
        EXECUTE format('CREATE TABLE public.job_assignment_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            job_id %s REFERENCES public.jobs(id) ON DELETE CASCADE,
            tech_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
            manager_id UUID REFERENCES public.users(id),
            status TEXT DEFAULT ''pending'',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', jobs_id_type);
    END IF;
END $$;

-- 10. JOB ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.job_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
    tech_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (job_id, tech_id)
);

-- 11. JOB NOTES
CREATE TABLE IF NOT EXISTS public.job_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.jobs(id) ON DELETE CASCADE,
    status_step TEXT DEFAULT 'Update',
    note TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. SALES OPPORTUNITIES
DO $$
DECLARE
    clients_id_type TEXT;
    jobs_id_type TEXT;
BEGIN
    SELECT format_type(a.atttypid, a.atttypmod) INTO clients_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'clients' AND a.attname = 'id' AND a.attnum > 0;

    SELECT format_type(a.atttypid, a.atttypmod) INTO jobs_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'jobs' AND a.attname = 'id' AND a.attnum > 0;

    IF clients_id_type IS NULL THEN clients_id_type := 'UUID'; END IF;
    IF jobs_id_type IS NULL THEN jobs_id_type := 'UUID'; END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sales_opportunities'
    ) THEN
        EXECUTE format('CREATE TABLE public.sales_opportunities (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            client_id %s REFERENCES public.clients(id) ON DELETE SET NULL,
            company_name TEXT NOT NULL,
            contact_name TEXT,
            contact_email TEXT,
            contact_phone TEXT,
            opportunity_title TEXT NOT NULL,
            stage TEXT DEFAULT ''Lead'',
            source TEXT,
            estimated_value NUMERIC(12, 2) DEFAULT 0,
            expected_close_date DATE,
            probability INTEGER DEFAULT 0,
            quote_status TEXT DEFAULT ''Not Started'',
            quote_reference TEXT,
            quote_sent_date DATE,
            next_follow_up_date DATE,
            owner_name TEXT,
            notes TEXT,
            handover_status TEXT DEFAULT ''not_ready'',
            handover_job_id %s REFERENCES public.jobs(id) ON DELETE SET NULL,
            imported_at TIMESTAMPTZ,
            created_by TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )', clients_id_type, jobs_id_type);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_opportunities' AND column_name = 'client_id'
    ) THEN
        EXECUTE format('ALTER TABLE public.sales_opportunities ADD COLUMN client_id %s REFERENCES public.clients(id) ON DELETE SET NULL', clients_id_type);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'sales_opportunities' AND column_name = 'handover_job_id'
    ) THEN
        EXECUTE format('ALTER TABLE public.sales_opportunities ADD COLUMN handover_job_id %s REFERENCES public.jobs(id) ON DELETE SET NULL', jobs_id_type);
    END IF;
END $$;

ALTER TABLE IF EXISTS public.sales_opportunities
    ADD COLUMN IF NOT EXISTS company_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_name TEXT,
    ADD COLUMN IF NOT EXISTS contact_email TEXT,
    ADD COLUMN IF NOT EXISTS contact_phone TEXT,
    ADD COLUMN IF NOT EXISTS opportunity_title TEXT,
    ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'Lead',
    ADD COLUMN IF NOT EXISTS source TEXT,
    ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS expected_close_date DATE,
    ADD COLUMN IF NOT EXISTS probability INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quote_status TEXT DEFAULT 'Not Started',
    ADD COLUMN IF NOT EXISTS quote_reference TEXT,
    ADD COLUMN IF NOT EXISTS quote_sent_date DATE,
    ADD COLUMN IF NOT EXISTS next_follow_up_date DATE,
    ADD COLUMN IF NOT EXISTS owner_name TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS handover_status TEXT DEFAULT 'not_ready',
    ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.sales_opportunities DROP CONSTRAINT IF EXISTS sales_opportunities_stage_check;
ALTER TABLE public.sales_opportunities ADD CONSTRAINT sales_opportunities_stage_check
CHECK (stage IN ('Lead', 'Qualified', 'Quoted', 'Negotiation', 'Won', 'Lost'));

ALTER TABLE public.sales_opportunities DROP CONSTRAINT IF EXISTS sales_opportunities_handover_status_check;
ALTER TABLE public.sales_opportunities ADD CONSTRAINT sales_opportunities_handover_status_check
CHECK (handover_status IN ('not_ready', 'created', 'completed'));

ALTER TABLE public.sales_opportunities DROP CONSTRAINT IF EXISTS sales_opportunities_quote_status_check;
ALTER TABLE public.sales_opportunities ADD CONSTRAINT sales_opportunities_quote_status_check
CHECK (quote_status IN ('Not Started', 'Draft', 'Sent', 'Revised', 'Accepted', 'Declined'));

-- 13. SALES ACTIVITIES
CREATE TABLE IF NOT EXISTS public.sales_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
    activity_type TEXT DEFAULT 'Note',
    activity_note TEXT NOT NULL,
    next_action_date DATE,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.sales_activities
    ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS activity_type TEXT DEFAULT 'Note',
    ADD COLUMN IF NOT EXISTS activity_note TEXT,
    ADD COLUMN IF NOT EXISTS next_action_date DATE,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 14. TRIP PLANS
CREATE TABLE IF NOT EXISTS public.trip_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_name TEXT NOT NULL,
    technician_user_id TEXT,
    technician_name TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    planned_days INTEGER DEFAULT 1,
    status TEXT DEFAULT 'planned',
    total_travel_minutes INTEGER DEFAULT 0,
    total_work_minutes INTEGER DEFAULT 0,
    total_distance_km NUMERIC(12, 2) DEFAULT 0,
    selected_site_ids JSONB DEFAULT '[]'::jsonb,
    route_payload JSONB DEFAULT '{}'::jsonb,
    map_link TEXT,
    started_at TIMESTAMPTZ,
    paused_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.trip_plans
    ADD COLUMN IF NOT EXISTS plan_name TEXT,
    ADD COLUMN IF NOT EXISTS technician_user_id TEXT,
    ADD COLUMN IF NOT EXISTS technician_name TEXT,
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS end_date DATE,
    ADD COLUMN IF NOT EXISTS planned_days INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'planned',
    ADD COLUMN IF NOT EXISTS total_travel_minutes INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_work_minutes INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_distance_km NUMERIC(12, 2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS selected_site_ids JSONB DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS route_payload JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS map_link TEXT,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS created_by TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.trip_plans DROP CONSTRAINT IF EXISTS trip_plans_status_check;
ALTER TABLE public.trip_plans ADD CONSTRAINT trip_plans_status_check
CHECK (status IN ('draft', 'planned', 'in_progress', 'paused', 'completed', 'cancelled'));

-- 15. SECURITY & POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_plans ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Generic "Allow All" for project speed, update for production later
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'users') THEN
        CREATE POLICY "Allow All Access" ON public.users FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'clients') THEN
        CREATE POLICY "Allow All Access" ON public.clients FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'sites') THEN
        CREATE POLICY "Allow All Access" ON public.sites FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'inventory') THEN
        CREATE POLICY "Allow All Access" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'inventory_logs') THEN
        CREATE POLICY "Allow All Access" ON public.inventory_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'app_activity_logs') THEN
        CREATE POLICY "Allow All Access" ON public.app_activity_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'jobs') THEN
        CREATE POLICY "Allow All Access" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'job_assignments') THEN
        CREATE POLICY "Allow All Access" ON public.job_assignments FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'job_notes') THEN
        CREATE POLICY "Allow All Access" ON public.job_notes FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'sales_opportunities') THEN
        CREATE POLICY "Allow All Access" ON public.sales_opportunities FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'sales_activities') THEN
        CREATE POLICY "Allow All Access" ON public.sales_activities FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'trip_plans') THEN
        CREATE POLICY "Allow All Access" ON public.trip_plans FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 16. HELPER FUNCTIONS
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_updated_at ON public.inventory;
CREATE TRIGGER trg_inventory_updated_at
BEFORE UPDATE ON public.inventory
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.job_assignment_requests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'job_assignment_requests') THEN
        CREATE POLICY "Allow All Access" ON public.job_assignment_requests FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date
ON public.jobs(scheduled_date);

CREATE INDEX IF NOT EXISTS idx_jobs_status
ON public.jobs(status);

CREATE INDEX IF NOT EXISTS idx_jobs_client_site
ON public.jobs(client_id, site_id);

CREATE INDEX IF NOT EXISTS idx_inventory_serial_number
ON public.inventory(serial_number);

CREATE INDEX IF NOT EXISTS idx_inventory_ch_number
ON public.inventory(ch_number);

CREATE INDEX IF NOT EXISTS idx_inventory_recalibration
ON public.inventory(re_calibration_date);

CREATE INDEX IF NOT EXISTS idx_app_activity_logs_occurred_at
ON public.app_activity_logs(occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_activity_logs_session_id
ON public.app_activity_logs(session_id);

CREATE INDEX IF NOT EXISTS idx_app_activity_logs_module_event
ON public.app_activity_logs(module_name, event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_activity_logs_user_email
ON public.app_activity_logs(user_email, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_assignments_job_id
ON public.job_assignments(job_id);

CREATE INDEX IF NOT EXISTS idx_job_assignments_tech_id
ON public.job_assignments(tech_id);

CREATE INDEX IF NOT EXISTS idx_job_notes_job_id_created_at
ON public.job_notes(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_assignment_requests_status_created
ON public.job_assignment_requests(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_assignment_requests_updated_at
ON public.job_assignment_requests(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_stage
ON public.sales_opportunities(stage);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_owner
ON public.sales_opportunities(owner_name);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_client
ON public.sales_opportunities(client_id);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_close_date
ON public.sales_opportunities(expected_close_date);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_quote_status
ON public.sales_opportunities(quote_status);

CREATE INDEX IF NOT EXISTS idx_sales_opportunities_next_follow_up
ON public.sales_opportunities(next_follow_up_date);

CREATE INDEX IF NOT EXISTS idx_sales_activities_opportunity_created
ON public.sales_activities(opportunity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_plans_status_updated
ON public.trip_plans(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_plans_technician_start
ON public.trip_plans(technician_user_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_trip_plans_start_date
ON public.trip_plans(start_date DESC);

DROP TRIGGER IF EXISTS trg_job_assignments_updated_at ON public.job_assignments;
CREATE TRIGGER trg_job_assignments_updated_at
BEFORE UPDATE ON public.job_assignments
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_job_notes_updated_at ON public.job_notes;
CREATE TRIGGER trg_job_notes_updated_at
BEFORE UPDATE ON public.job_notes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_job_assignment_requests_updated_at ON public.job_assignment_requests;
CREATE TRIGGER trg_job_assignment_requests_updated_at
BEFORE UPDATE ON public.job_assignment_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_opportunities_updated_at ON public.sales_opportunities;
CREATE TRIGGER trg_sales_opportunities_updated_at
BEFORE UPDATE ON public.sales_opportunities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_sales_activities_updated_at ON public.sales_activities;
CREATE TRIGGER trg_sales_activities_updated_at
BEFORE UPDATE ON public.sales_activities
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_trip_plans_updated_at ON public.trip_plans;
CREATE TRIGGER trg_trip_plans_updated_at
BEFORE UPDATE ON public.trip_plans
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
