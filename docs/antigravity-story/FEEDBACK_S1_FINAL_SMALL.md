# Final small correction before browser recheck

Round 4 improvements are present and build passes. One field fallback remains broken in the template: shotPrompt uses ??, so video_prompt='' hides a valid image_prompt although readiness now counts it. Reuse the existing extractGeneratedPrompt helper by exporting/importing it (or minimally equivalent shared function); no new abstraction. Add a behavioral case for whitespace video prompt + valid image prompt. Likewise composed_image='' must not hide a valid first_frame_image; use a single existing safe selection helper if needed in both readiness and cards, preserving safety checks.

Move dramaGuard.start and episodeGuard.invalidate before invalid-ID early return so invalid route transitions also invalidate older requests. Tests must exercise invalidation lifecycle, not source grep.

Only helper/view/test and DELIVERY_S1.md may change here. No extra features or locale reads. Run exact three authorized test/coverage/build commands, update delivery and finish within two minutes. Existing common.title or billing integration remains out of scope.
