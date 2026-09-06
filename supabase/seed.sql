-- BlinkGo canonical seed entrypoint.
--
-- Production and staging records must never be embedded in the repository.
-- Deterministic acceptance fixtures are provisioned and removed by the
-- dedicated test scripts after migrations complete. Keeping this file
-- intentionally non-mutating makes `supabase db reset` reproducible without
-- silently creating deployable demo accounts or credentials.

select 1;
