# Independent S1 acceptance recheck — real media regression

Your 23-PASS closeout did not verify media loads. PO observed all four real videos at /drama/2/story have readyState 0 because src /static/static/... returns 404. /static/merged/5fea83c1-9273-4454-a150-4988dce113df.mp4 is HTTP200 video/mp4. Therefore preceding report is partial for real media, not accepted. Correct this overclaim in final report; a video element/src alone is not media success.

Product is frozen after Dev round6. Only edit qa_s1.py and QA_S1.md. Read diff/helper/view/tests independently, inspect guards/safety/house spacing. Only permitted validation commands already exact existing tests/coverage/build/Python; no API mutations/paid calls/credentials/new installs. Five-minute maximum.

Keep current 23 browser checks. Add real media acceptance on actual /drama/2/story: all four existing videos (one final and three shots) have /static/... paths without double static, successful HTTP 200/206 video content, loaded metadata readyState >=1, finite positive actual duration and no media error. Actuate local existing media playback safely in script to prove at least final video's currentTime advances, no generation. Avoid claiming duration label as actual billing usage. Save real frame screenshot after metadata/playback, then pause before navigating. Save actual media facts/status in machine-readable run summary and current trace.

Check visual main-card padding/gaps using rendered browser/styles and screenshot (not string-only source check). Native global card theme remains in use.

Rerun helper test/coverage and frontend build after the last code change. Do not accept stale commands. Update QA_S1 with exact actual commands, counts, evidence paths, any defects and explicit NOT RUN. SPA route-ID inflight race remains NOT RUN live if you cannot safely drive a true same-component route change. The previous suggested address-bar full reload is not a valid manual reproduction of this SPA race; replace it with a valid in-app route transition/manual dev harness requirement, or explicitly say no safe public repro available and source/helper tests only. No full-goto race claim.

Keep historical evidence intact. PASS limited to S1 read-only view; actual paid render, Tora key/credit/settlement and generative skill quality not implemented/not run. Final response required.
