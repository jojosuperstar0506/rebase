-- 010_workspace_onboarding.sql
--
-- Adds the columns the new signup → wizard → dashboard flow needs.
--
--   is_onboarded         flag we gate the dashboard on. Until it's true,
--                        ProtectedRoute redirects to /signup?step=<next>.
--   onboarding_step      'account' | 'brand' | 'competitors' | 'goals' | 'done'
--                        Lets the wizard resume after a refresh.
--   onboarding_goals     freeform JSONB: { tracking: [...], cadence, email_notifs }
--   user_email           used for password login (replaces invite-code-only).
--   user_password_hash   pbkdf2-sha256 hash, format: "iters$salt_hex$hash_hex"
--
-- The legacy invite-code flow still works untouched — applicants JSON
-- file → /api/auth/verify-code → JWT. The new flow is additive.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_onboarded BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS onboarding_step TEXT NOT NULL DEFAULT 'account'
    CHECK (onboarding_step IN ('account', 'brand', 'competitors', 'goals', 'done'));

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS onboarding_goals JSONB;

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS user_email TEXT;

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS user_password_hash TEXT;

-- One email per workspace, but allow nulls so legacy invite-code workspaces
-- (which have no email) remain valid.
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_user_email
    ON workspaces (lower(user_email))
    WHERE user_email IS NOT NULL;

-- Useful index for "have I completed onboarding?" lookups on every request.
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id_onboarded
    ON workspaces (user_id, is_onboarded);

-- Backfill: any existing workspace counts as onboarded (it was created
-- by a user who already completed the legacy flow).
UPDATE workspaces SET is_onboarded = TRUE, onboarding_step = 'done'
WHERE created_at < NOW() AND is_onboarded = FALSE;
