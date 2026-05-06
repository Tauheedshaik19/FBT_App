-- Run this once in Supabase SQL Editor to stop client/site deletes from deleting jobs.
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.jobs'::regclass
          AND contype = 'f'
          AND confrelid = 'public.clients'::regclass
    LOOP
        EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_client_id_fkey
        FOREIGN KEY (client_id)
        REFERENCES public.clients(id)
        ON DELETE SET NULL;

    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.jobs'::regclass
          AND contype = 'f'
          AND confrelid = 'public.sites'::regclass
    LOOP
        EXECUTE format('ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS %I', constraint_record.conname);
    END LOOP;

    ALTER TABLE public.jobs
        ADD CONSTRAINT jobs_site_id_fkey
        FOREIGN KEY (site_id)
        REFERENCES public.sites(id)
        ON DELETE SET NULL;
END $$;
