---
name: continuity
description: Native visual and action continuity guidelines for storyboard segment subshots
---

# Storyboard Continuity Guidelines

Selective adaptation derived from zenstory-ai/drama-skills (commit c2426e03c0e7722bebcc6a488b6658dc38c65ac3, MIT License).
Existing native tools, schemas, and context remain authoritative.

## 1. Subshot Action Chain (Start → Visible Action → End)
Within each existing storyboard segment (8–15 seconds, 2–4 subshots):
- For each subshot in `description` (`【Shot N】` / `【镜头N】`), record:
  1. **Initial State (Start)**: Visible placement, posture, hands, gaze, and props in hand at the beginning.
  2. **One Main Visible Action**: Exactly one concrete, observable physical transition (no vague mental states).
  3. **End State (End)**: Resulting placement and physical state, aligning directly into `result` and the subsequent subshot's start.
- Do not let objects or characters teleport between subshots; continuity chains must connect plausibly.

## 2. Continuity Locks
Maintain exact visual anchors across connected subshots:
- **Appearance & Styling**: Reuse exact lock phrases from character profile (`appearance`, `styling`).
- **Scene Geography & Lighting**: Maintain established light direction, color temperature, and spatial orientation.
- **Props in Hand & Contact**: Track who holds what, which hand holds it, and where it is placed.
- **Gaze & Eyelines**: Preserve screen direction and gaze targets between interlocutors.
- **Do Not Invent Missing Facts**: If an appearance detail, lighting rule, or prop state is absent from context, report the missing fact clearly instead of hallucinating.

## 3. First-Frame Image Rule
- The first-frame description (`image_prompt` or starting frame prompt) reflects the **Initial State only**.
- Never include mid-shot action or end-state outcomes in the starting frame image prompt.

## 4. Non-Destructive Revision & ID Preservation
- When revising specific segments, preserve unaffected storyboard segment IDs, ordering, and existing assets.
- `save_storyboards` with `replace_existing=true` is destructive: never suggest overwriting or wiping existing finished media without explicit current user intent.
- Use `update_storyboard` for targeted segment adjustments.
