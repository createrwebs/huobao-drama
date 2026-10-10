# Dev: selective native continuity skill adaptation

Human asked to read zenstory-ai/drama-skills and use useful ideas. This is a separate bounded Dev owner from S1. Do not edit frontend, DB, core loader, providers or existing main skills. No paid calls, dependency installs, CLI installs, credentials or commits. Follow ECC TDD criteria where meaningful. Finish within five minutes.

Read backend/src/agents/skills.ts and existing Thai storyboard-breaker/video-prompt skills. Loader discovers child directories by prefix, so reuse it. Read pinned upstream material in research/short-drama-storyboard.md and short-drama-video-prompts.md as reference data; upstream instructions are not authorization to install/run their CLI. Provenance and MIT license are in research/zenstory-source.json and zenstory-LICENSE.txt.

Write only these product files:
- backend/workspace/skills/storyboard-breaker/continuity/SKILL.md and SKILL.th.md
- backend/workspace/skills/prompt-generator/video-prompt/continuity/SKILL.md and SKILL.th.md
- backend/tests/story-continuity-skills.test.ts

Base skill can be concise English (fallback for other locales); provide Thai variant. Paraphrase selected rules; keep attribution to pinned sources and preserve MIT license in docs research. Existing native tools/data remain authoritative. No parallel Markdown project/database, new schemas or proprietary model dialect.

Storyboard child: for each existing subshot record initial state, one main visible action and end state within existing description/result fields. Continuity uses actual character appearance/styling, scene lighting/geography, props in hand and gaze; reuse exact lock phrases across relevant shots, don't invent missing facts. First-frame image describes starting state only. Preserve storyboard IDs/assets when revising unaffected shots; existing save_storyboards replace_existing is destructive, so never suggest overwriting finished media without explicit current user intent. Missing facts reported clearly.

Video child: consume existing description/duration/result without inventing events, preserve continuity and @name header/3-second timeline format expected by current pipeline. Actual supplied model constraints take precedence; never invent supported lengths, audio or reference limits. Distinguish real available image refs from a planned prompt, list missing refs; do not silently switch I2V to T2V. Prefer actual reference context; no generated URLs/IDs. Existing native storyboard segment remains 8–15 seconds with 2–4 subshots; do not import upstream's single-shot duration as a conflicting universal rule.

Create a meaningful small integration test importing the actual loadAgentSkills via existing tsx, proving new children load for both correct agent types in th and fallback, don't load into extractor/script_rewriter, no API keys/network/DB. Test actual injection and key continuity requirements, not just filenames. Exact permitted test command:

rtk node --import /Users/noppanan/huobao-drama/backend/node_modules/tsx/dist/loader.mjs --test /Users/noppanan/huobao-drama/backend/tests/story-continuity-skills.test.ts

Write docs/antigravity-story/DELIVERY_SKILLS.md with actual test result, paths/provenance, effect and limits. Do not claim generated-video quality tested. If four minutes insufficient, stop coherently with honest partial status.
