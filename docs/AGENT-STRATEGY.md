# Is Rebase an Agent? — Definition, Current State, and the Path

> A plain-language reference for the founders. Answers four questions: what
> "agent" means in 2026, where Rebase actually stands, what's hardest to fix,
> and the concrete plan to become an agent.
>
> Every technical claim about Rebase below was verified against the codebase
> on 2026-06-13 (primarily `services/competitor_intel/run_analysis_for_workspace.sh`,
> `scoring.py`, and the pipeline files). Sources for industry claims are cited inline.

---

## 1. What "agent" means today

### The one-sentence definition the industry uses

Anthropic (the company that makes the model Rebase runs on) draws the line cleanly ([Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)):

- **Workflow** — LLMs and tools run through **predefined code paths** a developer wrote.
- **Agent** — the **LLM itself decides** what to do next and which tools to call.

The test is **"who owns the control flow?"** If your code decides the sequence of steps, it's a workflow. If the model decides the sequence, it's an agent.

### The L1–L5 autonomy scale

The market has converged on a self-driving-style scale ([arXiv: Levels of Autonomy for AI Agents](https://arxiv.org/html/2506.12469v1)):

| Level | Name | What it does | Human's role |
|---|---|---|---|
| **L1** | Reactive / assistive | Answers questions, generates content on request (autocomplete, chat) | Does everything with the output |
| **L2** | Task-based | Runs a bounded, defined task end-to-end | Reviews all output before it's used |
| **L3** | Conditional autonomy | Plans + executes multi-step work, self-corrects, stops at a "gate" for sign-off on high-stakes actions | Approves key gates; audits the rest |
| **L4** | High autonomy | Self-directs its own backlog of work | Audits periodically |
| **L5** | Full autonomy | No human in the loop | None |

Two facts that matter:
- **L3 is the practical production ceiling in 2026.** Even a16z says the fully-autonomous (L4/L5) vision "doesn't work yet" — limited by memory and hallucination ([TechCrunch](https://techcrunch.com/2025/05/12/even-a16z-vcs-say-no-one-really-knows-what-an-ai-agent-is/)).
- **The word "agent" is reserved for L3+.** L1 and L2 are "assistants" or "copilots," not agents.

### What earns the agent label, concretely

Across the highest-valued agent companies (Cognition/Devin $26B, Sierra $15.8B, Harvey $11B), five properties recur:

1. **Dynamic control flow** — the model chooses the next step, not a script.
2. **Autonomy** — acts without being prompted for each step.
3. **Tool use / acting in the world** — calls APIs that *do* things, not just generate text.
4. **Persistent memory** — remembers prior runs and outcomes.
5. **Closes the loop on a workflow** — observes the result of its action and adjusts.

---

## 2. Where Rebase stands today

### Classification: a workflow at L1–L2. Not an agent.

This is not an opinion. The production analysis chain
(`run_analysis_for_workspace.sh`) is a **fixed 8-stage bash script**:

```
1. scoring_pipeline          5. brand_positioning (LLM)
2. 9 metric pipelines        6. gtm_content (LLM)
3. domain_aggregation        7. product_opportunity (LLM)
4. composite_indices         8. white_space (LLM)
```

The order is hardcoded in the script. The LLM is called *inside* stages 5–8 to
write text, but it never decides what runs next — the bash script does. By
Anthropic's definition, that is a workflow, full stop.

### Scorecard against the five agent properties

| Property | Rebase today | Evidence |
|---|---|---|
| Dynamic control flow | ❌ No | `run_analysis_for_workspace.sh` hardcodes the 8-stage order |
| Autonomy | ❌ No | Runs only when a human clicks "Run Analysis" or the 2am cron fires |
| Tool use / acting | ❌ No | Output is a brief (text). No action is taken on any channel. |
| Persistent memory | ❌ No | Each run reads current scrape data; no memory of past recommendations or their outcomes |
| Closes the loop | ❌ No | Feedback (did the advice work?) is entered by a human, if at all |

**0 of 5.** Rebase is a well-built automated workflow that produces competitive-intelligence briefs. It is an **L1–L2 copilot**, not an agent.

### How far is "not an agent" from "agent"?

The gap is the jump from **"my code runs a fixed pipeline"** to **"the model runs a self-directed loop that acts and learns."** That gap is four capabilities (memory, dynamic control flow, acting, closing the loop) plus one hard prerequisite (a way to measure whether the agent is doing a good job). The rest of this doc ranks those and lays out the plan.

---

## 3. The gaps, ranked hardest → easiest for Rebase

Ranked by how hard each is **for this specific team to actually deliver** — accounting for what's pure engineering (fast, Claude-accelerated) versus what depends on outside factors (customers, data, third-party access).

### #1 (Hardest) — Acting on the world + closing the real feedback loop

**What it is:** the agent takes an action on the client's own channel (e.g. adjusts a Douyin ad via Ocean Engine), observes the real outcome, and adjusts.

**Why it's hardest for us — and how we tackle each blocker:**
- **External API access.** Acting requires official APIs (Ocean Engine for ads, Tmall, WeChat). Getting API access involves business verification that can take weeks. → *Tackle: start the Ocean Engine business-verification process early, in parallel with everything else, so it's not on the critical path.*
- **Real customers + real time.** "Did the recommendation work?" can only be answered after weeks of real campaigns by real customers. With one customer the data trickles. → *Tackle: this is gated by getting to 3–5 customers; treat customer acquisition as a technical dependency, not just a sales goal.*
- **Attribution.** Even with data, separating "our advice caused the result" from seasonality or luck is genuinely hard with few customers. → *Tackle: start with directional correlation, not causal proof; be honest in the UI that it's correlation.*
- **Depends on #2 being solved first.** You can't safely let an agent spend money until you can measure its reliability.

### #2 — Evaluating non-deterministic behavior

**What it is:** the ability to score "did the system do a good job?" when the output is different every run and there's no single correct answer.

Concretely: feed the LLM the same competitor data twice, get two differently-worded briefs. Both may be good. You cannot test with `output == expected`. You need a grader (an "LLM-as-judge" scoring against a rubric, plus human-labeled examples to calibrate it).

**Why it's hard for us — and how we tackle it:**
- It is not pure code. The grader's **rubric** is product judgment ("what makes a brief good?") and must be **calibrated** against human ratings over many iterations. → *Tackle: build it on today's low-stakes briefs first, where a wrong score is harmless, so the tooling and labeled dataset exist before any action is at stake.*
- The grader is itself an LLM (non-deterministic) and costs money to run continuously ([~$1–3 per 50-case run, ~10× traditional test cost](https://www.sitepoint.com/testing-ai-agents-deterministic-evaluation-in-a-non-deterministic-world/)). → *Tackle: run evals in batches, not on every commit; use the cost telemetry already in place (`ai_call_log`, migration 017) to watch spend.*
- Current CI is not ready for this (it runs basic deterministic tests). → *Tackle: keep evals out of the per-commit CI; run them as a separate scheduled job.*

**This is the prerequisite for #1.** It must exist before any write-action ships.

### #3 — Dynamic control flow (let the model own the loop)

**What it is:** replace the fixed 8-stage bash script with a loop where the model decides the next step (observe → think → act → observe, the "ReAct" pattern).

**Why it's mid-difficulty:** this is a real but **bounded engineering rewrite** — the kind Claude accelerates well. The standard tool is **LangGraph** (durable, checkpointed, supports pause-for-approval-then-resume — [now the default LangChain runtime](https://www.anthropic.com/research/building-effective-agents) ecosystem). The work is well-trodden and code-gated; no external dependencies, no waiting on data. The risk is mostly in testing the non-deterministic result — which is why #2 comes first.

### #4 (Easiest) — Persistent memory

**What it is:** store every recommendation and (later) its outcome, so the system can learn over time instead of starting fresh each run.

**Why it's easiest for us:** it's mechanical, code-gated, and **we just built the exact pattern** — `ai_call_log` (migration 017) logs every LLM call. The same approach (Postgres + `pgvector` for an episodic log of "recommended X → outcome Y") is a known quantity for this team. No calibration, no external access, no waiting. Off-the-shelf memory layers (Mem0, Zep) exist if we want them. **Do not fine-tune** — in-context memory over a vector store is the right tool at this stage.

### Summary ranking

| Rank | Gap | Main blocker | Mostly gated by |
|---|---|---|---|
| 1 (hardest) | Acting + real feedback loop | External APIs, customers, data accrual, attribution | Things outside pure engineering |
| 2 | Eval of non-deterministic behavior | Rubric design + calibration + cost | Human judgment + iteration time |
| 3 | Dynamic control flow | Architectural rewrite (LangGraph) | Engineering (Claude-accelerated) |
| 4 (easiest) | Persistent memory | None significant | Engineering (known pattern) |

---

## 4. The action plan: turning Rebase into an agent

The plan is sequenced to do the **foundational, low-risk pieces first** and defer the **risky, externally-gated action layer to last** — building the eval capability on harmless outputs before anything spends money.

### Stage 0 — Finish the honest intelligence layer (prerequisite)
Ship the index redesign already scoped in `docs/INTELLIGENCE-LAYER.md`: drop the dead signals, ship the clean indices, add confidence flags. An agent that learns from a noisy data foundation learns noise. Fix the foundation first.

### Stage 1 — Persistent memory (easiest gap, build first)
- Add an episodic log: `recommendation → context → (later) outcome`, Postgres + `pgvector`, mirroring the `ai_call_log` pattern.
- Immediately useful to today's product (show the customer their recommendation history) and is the substrate the agent will learn from.
- **Deliverable:** every brief's recommendations are stored and queryable.

### Stage 2 — Eval harness on the intelligence layer (the unlock, build in parallel)
- Build an LLM-as-judge that scores each brief against a rubric (cites real numbers? action is specific? no hallucinated claims?).
- Calibrate it against founder ratings until judge and human agree.
- **Deliverable:** a Goal-Completion-Rate number for briefs, tracked over time. This is the capability that later makes write-actions safe.

### Stage 3 — Dynamic control flow (the architectural shift)
- Rewrite the fixed pipeline as a LangGraph loop where the model decides the next step, with checkpointing and human-in-the-loop pause points.
- **Deliverable:** the system chooses its own analysis path instead of running a hardcoded 8-stage script. This is the moment it stops being a "workflow" and starts being agent-shaped.

### Stage 4 — Observation loop (close the loop, read-only)
- After a recommendation, the system automatically pulls the client's **own** metrics (consented) and reports back to itself whether the predicted outcome occurred.
- No actions taken yet — the human still executes — but the learning loop closes on the observe side.
- **Deliverable:** recommendations evolve from real observed outcomes, not human-entered feedback. This alone is most of the agent's value.

### Stage 5 — Gated write-actions (the last brick, decision-gated)
- Only after Stages 2 + 4 prove reliability: add gated actions on one sanctioned channel (Ocean Engine ads), with a human approval gate on every action initially.
- The approvals build the dataset that later lets you remove gates on action types the agent gets right 95%+ of the time.
- **Deliverable:** a true L3 agent on one channel, with metrics to prove it.

### Why this order

- **Risk rises with each stage; reward (the agent label) only at the end.** Front-loading memory and eval means the hardest cost (measuring non-deterministic quality) is paid when stakes are lowest.
- **Each stage stands alone.** If you stop after Stage 4, you have an excellent learning copilot — a real product. Stage 5 is the only stage that takes platform/cost/safety risk, and it's optional until the data justifies it.
- **The "agent" claim becomes true and provable at Stage 5, not before.** Until then, the honest label is "AI marketing copilot."

---

## What "done" looks like per level

| If Rebase reaches... | It can honestly be called... | Requires stages |
|---|---|---|
| Today | Automated competitive-intelligence workflow (L1–L2 copilot) | — |
| Stages 1–2 | A copilot that learns and can prove its quality | 0, 1, 2 |
| Stages 3–4 | An agent-shaped system that self-directs and learns from outcomes (still advises, doesn't act) | + 3, 4 |
| Stage 5 | A true L3 marketing agent on one channel, with metrics | + 5 |

---

## Cross-references
- `docs/INTELLIGENCE-LAYER.md` — the metric/index audit (Stage 0 foundation)
- `docs/SCHEMA.md` — DB layout (where memory + eval logs will live)
- `services/competitor_intel/run_analysis_for_workspace.sh` — the current fixed pipeline this plan replaces
- `backend/migrations/017_ai_call_log.sql` — the logging pattern Stage 1 reuses

When this doc goes stale, open a PR. A strategy doc that no longer matches reality is worse than none.
