# Final independent S1 recheck after Dev delivery

Dev round 5 fixes final empty-string prompt/image fallback and invalidation order, then freezes product. Confirm latest DELIVERY_S1.md is coherent; read only relevant changed source. Product READ-ONLY. PO did not accept round 1. Six skill loader tests and QA_SKILLS.md are accepted within loading/format scope only.

Repair/enhance qa_s1.py and run within this five-minute QA round. Exact permitted commands from TASK_QA_S1.md only; no git/probes. Retain run-isolated screenshot/trace/summary and finish QA_S1.md plus final response.

Required missing coverage:
1. Fixture populated shot with video_prompt='' + valid image_prompt and composed_image='' + valid first_frame_image. Assert actual prompt card and image src, not only aggregate readiness.
2. completed fixture = all shots with safe video_url; assert 100% completion. Current partial fixture must retain 33%.
3. Merge GET once returns 500, shots stay visible, .merge-error-box exists, retry actual button succeeds and final video appears. No hidden error acceptance.
4. Drive same-component route-ID race if feasible using the application's existing Vue router in this test environment, or document an explicit limitation with independent code review of actual dramaGuard plus actual request lifecycle tests. Full page goto that replaces document is not proof of SPA guard. Do not invent PASS for NOT RUN. Episode race must confirm delayed callback actually began before switching back.
5. Actual existing drama /drama/2/story: assert expected real title/episode count and 3 first-episode cards + 30 seconds, not only .page container. Follow existing studio navigation and assert correct URL. Escape malicious shot description as well as brief. No real mutations, no paid requests, no installs.

Run meaningful node tests + coverage, canonical build and real headed browser script. Reuse existing task stack. Report concrete defects promptly and stop within five minutes, not hidden continuation. Verdict must distinguish required product behavior PASS from any NOT RUN verification. All known correctness defects must be resolved before PO accepts S1. Preserve original first-round evidence.
