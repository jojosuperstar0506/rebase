/**
 * One-time migration: re-key existing workspaces from phone/email to invite code.
 *
 * WHY
 * ---
 * Pre-fix, JWT.sub was set to user.phone || user.email at login time, so
 * workspaces.user_id stored phone/email values. After the fix, JWT.sub =
 * inviteCode, and workspaces.user_id must match for the dashboard to find
 * the workspace.
 *
 * For new approvals, the /api/admin/approve route handles re-keying inline.
 * This script handles the BACKFILL — applicants who were approved before
 * the fix shipped.
 *
 * SAFETY
 * ------
 * - Idempotent: rows already keyed `RB-...` are skipped (`AND user_id NOT LIKE 'RB-%'`).
 * - Read-only dry-run by default. Pass `--apply` to actually run the UPDATEs.
 * - Wrapped in BEGIN/COMMIT — if anything throws, nothing changes.
 *
 * USAGE on ECS
 * ------------
 *   cd ~/rebase
 *   set -a && source backend/.env && set +a
 *   node backend/scripts/migrate_workspaces_to_invitecode.js          # dry-run
 *   node backend/scripts/migrate_workspaces_to_invitecode.js --apply  # commit
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const DRY_RUN = !process.argv.includes("--apply");
const APPLICANTS_DIR = path.join(__dirname, "..", "config", "applicants");

(async () => {
  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL not set. Did you `source backend/.env`?");
    process.exit(1);
  }
  if (!fs.existsSync(APPLICANTS_DIR)) {
    console.error(`✗ Applicants directory not found: ${APPLICANTS_DIR}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const files = fs.readdirSync(APPLICANTS_DIR).filter((f) => f.endsWith(".json"));
    console.log(`\n${DRY_RUN ? "[DRY-RUN]" : "[APPLY]"} Scanning ${files.length} applicant file(s)...\n`);

    const plan = [];
    for (const f of files) {
      let data;
      try { data = JSON.parse(fs.readFileSync(path.join(APPLICANTS_DIR, f), "utf8")); }
      catch (e) { console.warn(`  ⚠ skip ${f}: parse error`); continue; }

      if (data.status !== "approved" || !data.inviteCode) continue;

      const accountId = data.inviteCode.toUpperCase();
      const oldKeys = [data.phone, data.email].filter(Boolean);
      if (oldKeys.length === 0) continue;

      // Preview: which workspaces would be re-keyed?
      const { rows } = await client.query(
        `SELECT id, brand_name, user_id
           FROM workspaces
          WHERE user_id = ANY($1::text[])
            AND user_id NOT LIKE 'RB-%'`,
        [oldKeys]
      );

      if (rows.length > 0) {
        plan.push({ accountId, oldKeys, applicant: data.name, rows });
      }
    }

    if (plan.length === 0) {
      console.log("✓ Nothing to migrate. All approved applicants are already invite-code-keyed.");
      return;
    }

    console.log(`Found ${plan.length} applicant(s) with workspaces to re-key:\n`);
    for (const p of plan) {
      console.log(`  ${p.applicant} → ${p.accountId}`);
      for (const r of p.rows) {
        console.log(`    - ${r.id}  ${r.brand_name || "(no brand_name)"}  user_id=${r.user_id}`);
      }
    }

    if (DRY_RUN) {
      console.log("\n[DRY-RUN] No writes performed. Re-run with --apply to commit.");
      return;
    }

    console.log("\nApplying changes...");
    await client.query("BEGIN");
    let total = 0;
    for (const p of plan) {
      const { rowCount } = await client.query(
        `UPDATE workspaces
            SET user_id = $1
          WHERE user_id = ANY($2::text[])
            AND user_id NOT LIKE 'RB-%'`,
        [p.accountId, p.oldKeys]
      );
      console.log(`  ✓ ${p.accountId}: re-keyed ${rowCount} workspace(s)`);
      total += rowCount;
    }
    await client.query("COMMIT");
    console.log(`\n✓ Done. Re-keyed ${total} workspace(s) total.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("✗ Migration failed (rolled back):", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
