-- 39: OAuth support columns for public.users
-- Tracks which auth provider the user signed in with (email, google, apple, etc.)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS oauth_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_auth_provider ON users(auth_provider);
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON users(oauth_provider_id);

-- Backfill: existing users are email
UPDATE users SET auth_provider = 'email' WHERE auth_provider IS NULL;
