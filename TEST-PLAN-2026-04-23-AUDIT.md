# Test Plan — Audit Cleanup Batch (2026-04-23)

**Covers commits:** `f4fde66`, `dfbb272`, `327690d`, `0bf7e2d`, `e948086`
**Author:** Will (with Claude)
**Estimated execution time:** 25-35 minutes for the full plan

This plan covers everything that changed in today's session:
- Scoring fixes (commits 1-3): WTP baselines, domain rollup pollution, design_vision keywords
- Audit cleanup (commit 4): orphan endpoint deletes, semantic color tokens, shared style helpers

---

## 1. Backend — verify deletes didn't break anything

### 1.1 Server starts cleanly
```bash
# On ECS:
cd ~/rebase
git pull
pm2 restart rebase-backend
pm2 logs rebase-backend --lines 30 --nostream
```
**Pass criteria:** No `SyntaxError`, no `Cannot find module`, server logs `Express listening on port 3000`.

### 1.2 Deleted endpoints return 404
```bash
source backend/.env
# These three should now 404:
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-rebase-secret: $API_SECRET" http://localhost:3000/api/intelligence/optimize
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "x-rebase-secret: $API_SECRET" -H "Content-Type: application/json" -d '{"userId":"x","name":"x","industry":"x"}' http://localhost:3000/api/intelligence/setup
curl -s -o /dev/null -w "%{http_code}\n" -H "x-rebase-secret: $API_SECRET" http://localhost:3000/api/intelligence/profile/anyone
```
**Pass criteria:** All three return `404`.

### 1.3 Email feedback endpoint still works (we kept this one)
```bash
# This one should NOT 404 — it should validate params and return a (probably-403) response
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/intelligence/feedback?userId=x&reportId=x&section=x&rating=up&token=invalid"
```
**Pass criteria:** Returns `403` (token invalid) or `400` (missing params), NOT `404`. Means the route is still mounted.

### 1.4 Other CI endpoints still healthy
```bash
curl -s -H "x-rebase-secret: $API_SECRET" "http://localhost:3000/api/ci/admin/cleanup-brand-names" | head -c 200
curl -s -H "x-rebase-secret: $API_SECRET" "http://localhost:3000/api/ci/intelligence?workspace_id=cfadc29c-3016-4177-afe9-b08cfc068a9b" | head -c 200
```
**Pass criteria:** Returns JSON, not HTML/error page.

---

## 2. Scoring — verify the 3 fixes produce expected outputs

### 2.1 Re-run all metric pipelines on ECS to populate v1.2 / v1.1 rows
```bash
cd ~/rebase
set -a && source backend/.env && set +a

# Run all 9 metric pipelines + scoring + design_vision
for p in voice_volume mindshare content_strategy keyword kol_tracker design_vision launch_tracker price_analysis product_ranking; do
  echo "━━━ ${p} ━━━"
  ~/rebase/venv/bin/python -m services.competitor_intel.pipelines.${p}_pipeline --all || echo "[WARN] ${p} failed"
done

# Run scoring (includes new WTP v1.2)
~/rebase/venv/bin/python -m services.competitor_intel.scoring_pipeline --all

# Roll up domains (v1.1, exclude no_data fallbacks)
~/rebase/venv/bin/python -m services.competitor_intel.pipelines.domain_aggregation_pipeline --all
```
**Pass criteria:** No `Decimal not JSON serializable`, no `ImportError`, no traceback. Each pipeline reports per-brand scores.

### 2.2 WTP fix — Nike workspace baseline should match category, not handbag
```bash
psql "$DATABASE_URL" -c "
SELECT competitor_name,
       score,
       raw_inputs->>'baseline_source'   AS baseline_source,
       raw_inputs->>'baseline_category' AS baseline_category,
       raw_inputs->'inputs'->>'category_avg_price' AS cat_price
FROM analysis_results
WHERE workspace_id = 'cfadc29c-3016-4177-afe9-b08cfc068a9b'
  AND metric_type   = 'wtp'
  AND analyzed_at   > NOW() - INTERVAL '1 hour'
ORDER BY competitor_name;"
```
**Pass criteria:**
- Nike workspace has `brand_category = '运动鞋服'` (or similar) → `baseline_category` = `运动鞋服` and `cat_price` = `799`, NOT `350`.
- If `brand_category` is empty/unknown → `baseline_source` = `'workspace_median'` or `'generic_fallback'`.
- WTP score is no longer all `50` for every brand.

### 2.3 OMI workspace WTP should be unchanged (regression check)
```bash
psql "$DATABASE_URL" -c "
SELECT competitor_name, score, raw_inputs->>'baseline_category' AS baseline_category
FROM analysis_results
WHERE workspace_id = '0cf0e691-89f4-46f5-8c6f-ad227339e600'
  AND metric_type   = 'wtp'
  AND analyzed_at   > NOW() - INTERVAL '1 hour'
ORDER BY competitor_name;"
```
**Pass criteria:** `baseline_category = '女包'`, scores in same range as previous run (Songmont/古良吉吉/CASSILE differentiated).

### 2.4 Domain aggregation — Nike product_domain stops being identical 30
```bash
psql "$DATABASE_URL" -c "
SELECT competitor_name, score, raw_inputs->>'reason' AS reason
FROM analysis_results
WHERE workspace_id = 'cfadc29c-3016-4177-afe9-b08cfc068a9b'
  AND metric_type   = 'product_domain'
  AND analyzed_at   > NOW() - INTERVAL '1 hour'
ORDER BY competitor_name;"
```
**Pass criteria:** Either (a) scores DIFFER across Adidas/安踏/李宁 because real product data exists for some, OR (b) all scores are `0` with `reason = 'no_data'` (honest empty state, will surface as 🔒 N/A in UI). NOT all identical `30`.

### 2.5 Design_vision — sportswear keyword vocabulary applied
```bash
psql "$DATABASE_URL" -c "
SELECT competitor_name,
       score,
       raw_inputs->>'keyword_category' AS keyword_category,
       raw_inputs->>'keyword_source'   AS keyword_source
FROM analysis_results
WHERE workspace_id = 'cfadc29c-3016-4177-afe9-b08cfc068a9b'
  AND metric_type   = 'design_profile'
  AND analyzed_at   > NOW() - INTERVAL '1 hour'
ORDER BY competitor_name;"
```
**Pass criteria:** `keyword_category` = `sportswear` (if Nike workspace has that brand_category) or `unknown` (if category unset). NOT `womens_bags` for Nike-style workspaces.

### 2.6 Smoke-test the resolver locally (no DB needed)
```bash
PYTHONIOENCODING=utf-8 python -c "
import sys; sys.path.insert(0, '.')
from services.competitor_intel.category_baselines import resolve_baseline, resolve_design_keywords
# Should match expected mappings
assert resolve_baseline('女包')['category_key']      == 'womens_bags'
assert resolve_baseline('sportswear')['category_key']== 'sportswear'
assert resolve_baseline('运动鞋类')['source']         == 'keyword_match'
assert resolve_baseline(None)['source']               == 'generic_fallback'
assert resolve_baseline(None)['avg_price']            == 350.0    # backwards-compat
print('OK resolver tests passed')
"
```
**Pass criteria:** Prints `OK resolver tests passed`. No assertion errors.

---

## 3. Frontend — verify visual changes + zero regressions

### 3.1 Vercel build succeeds
```bash
# On Vercel dashboard, confirm latest deployment for commit e948086 shows "Ready"
# Or trigger manually:
git push  # already done
# Watch build log — should succeed with TS compiling clean
```
**Pass criteria:** Build status `Ready`. No `TS2307`, `TS2322`, or `TS2345` errors in log.

### 3.2 ColorSet additions don't break dark/light mode toggle
1. Open the deployed URL, log in.
2. Toggle between dark and light mode (top-right button).
3. Visit each page: `/`, `/ci`, `/ci/analytics`, `/ci/library`, `/ci/competitors`, `/ci/settings`, `/ci/help`, `/agents`, `/workflows`, `/costs`.

**Pass criteria:** Every page renders both modes without color regressions. No "missing color" black-on-black or white-on-white blocks.

### 3.3 Tokenized platform colors show correctly
1. Go to `/ci` (Brief)
2. Verify the Douyin pill on each content draft is the original Douyin pink (`#fe2c55` in dark, may shift in light).
3. Verify the Hook (3s) script section's left accent is also Douyin pink.
4. Verify the CTA (3s) accent is amber/orange (`C.warning`).
5. Verify "✓ Posted" text on a marked draft is green (`C.success`).

**Pass criteria:** Visual styling identical to pre-commit; the swap to `C.platformDouyin` / `C.warning` / `C.success` doesn't change appearance.

### 3.4 Tokenized domain colors in Analytics
1. Go to `/ci/analytics` → expand "See all 12 metrics" panel.
2. Each metric card has a small colored dot (Consumer = pink, Product = orange, Marketing = blue).
3. Confirm dots show in their expected color in BOTH dark and light mode.

**Pass criteria:** Colors render correctly. Note: dark mode uses brighter hex; light mode uses darker hex (intentional).

### 3.5 Library platform pills (XHS + Douyin)
1. Go to `/ci/library` → click "All Content" tab.
2. Each content card shows a colored pill (Douyin = `#fe2c55`, XHS = `#ff2442`).

**Pass criteria:** Pills render in correct platform color.

### 3.6 No console errors on any page
Open DevTools console, navigate through all the routes from §3.2.
**Pass criteria:** Zero red errors. Yellow warnings about React strict mode are OK.

---

## 4. Bug-hunt fallout from the changes

### 4.1 Domain rollup display — verify the API status enum still surfaces
1. On `/ci/analytics` for Nike workspace, the "All metrics" panel.
2. `product_domain` rollup row.

**Pass criteria:** Either shows a real number with no badge, OR shows 🔒 "N/A — Requires XHS" badge. The previous identical "30 for all" should be gone.

### 4.2 Brief renders on Nike + OMI workspaces both
1. Go to `/ci` for Nike workspace — page renders without errors.
2. Switch to OMI workspace (if you have one set up) — same.

**Pass criteria:** No "Cannot read properties of undefined" in console. No blank page.

### 4.3 New `theme/styles.ts` is importable
This is a sanity check only — no page imports it yet. But verify the file is included in the Vercel bundle:
```bash
# Check Vercel build manifest or:
ls frontend/dist/assets/ | head  # (locally if you build)
```
Or just confirm the file exists in git: `git show e948086 --stat` should list it.

**Pass criteria:** File present, no build error.

### 4.4 Joanna's local environment — pull and verify
Joanna should run on her Mac (when she's back online):
```bash
cd ~/projects/rebase
git pull
# nothing to test for her since she's not on /api/intelligence/*
# but verify her uncommitted xhs_scraper changes don't conflict
git status
```
**Pass criteria:** No merge conflicts in her worktree.

---

## 5. Rollback plan (if anything fails badly)

Each commit is independent, so we can revert selectively:

| If broken | Revert |
|---|---|
| Backend won't start after pull on ECS | `git revert e948086` (the audit cleanup commit) |
| WTP scores look wrong | `git revert dfbb272` (category baselines) |
| Domain rollups regress | `git revert 327690d` (rollup pollution fix) |
| Design vision scoring breaks | `git revert 0bf7e2d` (per-category keywords) |

After revert: `git push` then `pm2 restart rebase-backend` on ECS.

---

## 6. What success looks like

After running this plan, you should have:

1. ✅ Server running, all CI endpoints responding
2. ✅ 3 deleted endpoints return 404 (not 500)
3. ✅ Email feedback endpoint preserved
4. ✅ WTP scores differentiated for Nike workspace, baseline_category populated
5. ✅ OMI WTP scores unchanged (no regression for the original use case)
6. ✅ Nike product_domain no longer identical 30 across competitors
7. ✅ Design_vision uses sportswear keywords for sportswear workspace
8. ✅ Frontend builds clean on Vercel
9. ✅ Theme switching works on every page
10. ✅ Visual appearance unchanged (only the code structure improved)

Total time investment: ~25-35 min of running queries / clicking around.

If any step fails, paste the exact output and we debug. I'd rather hear about a real failure than have you check off items that didn't actually pass.

---

*End of test plan.*
