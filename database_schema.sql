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

-- 5. JOBS TABLE
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.sites(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    job_type VARCHAR(50) DEFAULT 'Installation',
    status VARCHAR(50) DEFAULT 'Unassigned',
    priority VARCHAR(20) DEFAULT 'medium',
    estimated_duration_hours DECIMAL(5, 2) DEFAULT 2.0,
    scheduled_date DATE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
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
    notes TEXT
);

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

-- 8. JOB ASSIGNMENT REQUESTS
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

-- 9. SECURITY & POLICIES
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    -- Generic "Allow All" for project speed, update for production later
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'users') THEN
        CREATE POLICY "Allow All Access" ON public.users FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'inventory') THEN
        CREATE POLICY "Allow All Access" ON public.inventory FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'inventory_logs') THEN
        CREATE POLICY "Allow All Access" ON public.inventory_logs FOR ALL USING (true) WITH CHECK (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow All Access' AND tablename = 'jobs') THEN
        CREATE POLICY "Allow All Access" ON public.jobs FOR ALL USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 10. HELPER FUNCTIONS
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
