-- Keep idx_payment_security_events_ip as the canonical index. The legacy
-- _ip_created index has an identical definition and only adds write overhead.
drop index if exists public.idx_payment_security_events_ip_created;

