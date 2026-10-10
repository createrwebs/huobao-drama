# PO notes before independent QA verdict

Real Chrome navigation: current project's detail → โหมดเนื้อเรื่อง succeeds at localhost:3013/drama/2/story. Existing first episode displays 3 storyboard segments, 30 seconds, actual Thai descriptions/video prompts and existing merged result. No generation invoked. This is supporting PO inspection, not substitute for independent QA acceptance.

Scope audit: 139 tracked source hashes checked against baseline a4edb3c. Only 5 locales, detail entry and Nuxt route differ among tracked baseline files; backend/src unchanged. New Story Mode/helper/tests plus continuity child skills are authorized additions. Unrelated flow-drama-autopilot/flow-agent-ref preserved. git diff --check passes.

Unresolved until QA/rework:
- New view introduces nonexistent style variables (`--color-primary`, `--text-main`, `--bg-card`, `--border-color`) rather than actual studio.css tokens (`--accent`, `--text-0`, `--bg-surface`, `--border`). It duplicates global .btn/.card styles. Reuse global styles and existing tokens.
- Drama GET loadData has no request token guard. Navigating between drama IDs can allow delayed old drama response to replace current state; episode guard alone doesn't protect this.
- Merge GET errors are still caught as [], so unavailable final result is indistinguishable from no result.
- Prompt readiness falls back to description; a description alone is not a generated image/video prompt.

Existing common.title header and legacy 1s duration labels on the detail page were already present before Story Mode; don't attribute to this change. They are outside S1 scope.

Whole product remains unfinished: S2 planner/publish, S3 durable runs and S4 central key/credit/success billing are not implemented or accepted by this round. Colab stays parked. No real LLM/provider/financial transaction validation.
