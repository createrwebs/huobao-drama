import os
import sys
import json
import math
import asyncio
from datetime import datetime
import urllib.request
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeoutError

ARTIFACTS_BASE_DIR = "/Users/noppanan/huobao-drama/docs/antigravity-story/qa-artifacts"
os.makedirs(ARTIFACTS_BASE_DIR, exist_ok=True)

RUN_TIMESTAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
RUN_DIR = os.path.join(ARTIFACTS_BASE_DIR, f"run_{RUN_TIMESTAMP}")
os.makedirs(RUN_DIR, exist_ok=True)

BASE_URL = "http://localhost:3013"

test_results = []
mutations_detected = []

def record(name, status, detail=""):
    print(f"[{status}] {name} - {detail}")
    test_results.append({
        "name": name,
        "status": status,
        "detail": detail,
        "timestamp": datetime.now().isoformat()
    })

async def run_qa():
    print(f"=== Starting Final S1 QA Playwright Recheck ===")
    print(f"Target Base URL: {BASE_URL}")
    print(f"Run Directory: {RUN_DIR}")

    # Pre-flight reachability
    server_online = False
    try:
        req = urllib.request.Request(BASE_URL, headers={"User-Agent": "Independent-QA-Runner"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status in (200, 304, 404):
                server_online = True
    except Exception as e:
        record("Server Reachability", "FAIL", f"Connection error: {e}")
        server_online = False

    if not server_online:
        print(f"[FATAL] Nuxt frontend server is unreachable at {BASE_URL}. Blocking execution.")
        with open(os.path.join(RUN_DIR, "qa_run_summary.json"), "w") as f:
            json.dump({
                "verdict": "BLOCKED",
                "reason": f"Server unreachable at {BASE_URL}",
                "results": test_results
            }, f, indent=2)
        sys.exit(2)

    record("Server Reachability", "PASS", f"Connected successfully to {BASE_URL}")

    playwright = await async_playwright().start()
    browser = None
    context = None
    page = None
    launch_mode = "headless=False"

    try:
        try:
            browser = await playwright.chromium.launch(headless=False)
            launch_mode = "headless=False"
        except Exception as e:
            print(f"headless=False launch failed ({e}), falling back to headless=True")
            browser = await playwright.chromium.launch(headless=True)
            launch_mode = "headless=True"

        record("Browser Launch", "PASS", f"Chromium launched ({launch_mode})")

        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="th-TH"
        )
        await context.tracing.start(screenshots=True, snapshots=True, sources=True)
        page = await context.new_page()
        page.set_default_timeout(10000)

        media_facts = []

        # Mock synchronization states
        mock_state = {
            "drama_996_attempts": 0,
            "ep_101_merge_attempts": 0,
            "ep_109_shots_attempts": 0,
            "delay_ep_102": False,
            "ep_102_started_event": asyncio.Event(),
        }

        async def handle_api_route(route):
            req = route.request
            method = req.method
            url = req.url

            # STRICT READ-ONLY: Abort any mutation
            if method in ["POST", "PUT", "PATCH", "DELETE"]:
                mutations_detected.append(f"{method} {url}")
                print(f"[MUTATION REJECTED] {method} {url}")
                await route.abort()
                return

            # Pass through real project dramas (e.g. drama 2)
            if "/api/v1/dramas/2" in url or "/api/v1/episodes/" in url and "10" not in url and "9" not in url:
                await route.continue_()
                return

            # Fixture: Drama 999
            if "/api/v1/dramas/999" in url and "/episodes" not in url:
                data = {
                    "id": 999,
                    "title": "QA Fixture Drama ซีรีส์ทดสอบ",
                    "description": "เรื่องย่อสำหรับทดสอบ QA <script>window.__XSS__=true</script><img src=x onerror=\"window.__XSS__=true\">",
                    "style": "anime",
                    "episodes": [
                        {"id": 101, "episode_number": 1, "duration": 45},
                        {"id": 102, "episode_number": 2, "duration": 60},
                        {"id": 103, "episode_number": 3, "duration": 20}
                    ]
                }
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
                return

            # Fixture: Episode 101 Storyboards
            # Item 1: Shot with video_prompt='' + valid image_prompt, composed_image='' + valid first_frame_image
            # Item 5: Malicious shot description escaping test
            if "/api/v1/episodes/101/storyboards" in url:
                shots = [
                    {
                        "id": 11,
                        "storyboard_number": 2,
                        "duration": 3.5,
                        "description": "ช็อตที่สอง Action Sequence",
                        "video_prompt": "   ", # Empty/whitespace video prompt -> must fallback to image_prompt
                        "image_prompt": "Fallback Image Prompt Shot 2",
                        "composed_image": "", # Empty -> must fallback to first_frame_image
                        "first_frame_image": "/static/fixtures/shot2_frame.png",
                        "video_url": None,
                        "status": "completed"
                    },
                    {
                        "id": 10,
                        "storyboard_number": 1,
                        "duration": 5.0,
                        "description": "ช็อตแรก <script>window.__SHOT_XSS__=true</script><img src=x onerror=\"window.__SHOT_XSS__=true\">",
                        "image_prompt": "Prompt for shot 1 wide shot",
                        "composed_image": "/static/fixtures/shot1.png",
                        "video_url": "https://example.com/fixture/shot1.mp4",
                        "status": "pending"
                    },
                    {
                        "id": 12,
                        "storyboard_number": 3,
                        "duration": 2.5,
                        "description": "ช็อตที่สาม With Unsafe Links",
                        "video_prompt": "Prompt for shot 3",
                        "composed_image": "javascript:alert(1)",
                        "video_url": "//evil.com/shot3.mp4",
                        "status": "draft"
                    }
                ]
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(shots))
                return

            # Item 3: Merge GET once returns 500, shots stay visible, retry succeeds
            if "/api/v1/merge/episodes/101/merges" in url:
                mock_state["ep_101_merge_attempts"] += 1
                if mock_state["ep_101_merge_attempts"] == 1:
                    print("[MOCK] Simulating 500 error for Episode 101 merge fetch")
                    await route.fulfill(status=500, content_type="application/json", body=json.dumps({"message": "Simulated merge 500 error"}))
                    return
                else:
                    merges = [
                        {
                            "id": 501,
                            "status": "completed",
                            "merged_url": "/static/fixtures/merged_ep1.mp4"
                        }
                    ]
                    await route.fulfill(status=200, content_type="application/json", body=json.dumps(merges))
                    return

            # Fixture: Episode 102 (Delayed callback for overlapping race test)
            if "/api/v1/episodes/102/storyboards" in url:
                if mock_state["delay_ep_102"]:
                    print("[RACE TEST] EP 102 request arrived. Signaling event and sleeping 1.0s...")
                    mock_state["ep_102_started_event"].set()
                    await asyncio.sleep(1.0)
                    print("[RACE TEST] Delayed EP 102 fulfilling now.")
                await route.fulfill(status=200, content_type="application/json", body=json.dumps([]))
                return

            if "/api/v1/merge/episodes/102/merges" in url:
                await route.fulfill(status=200, content_type="application/json", body=json.dumps([]))
                return

            # Item 2: Episode 103 Completed Fixture (All shots with safe video_url -> 100% completion)
            if "/api/v1/episodes/103/storyboards" in url:
                shots = [
                    {
                        "id": 31,
                        "storyboard_number": 1,
                        "duration": 4.0,
                        "description": "Full Episode Shot 1",
                        "video_prompt": "Cinematic Drone 1",
                        "composed_image": "/static/fixtures/shot103_1.png",
                        "video_url": "https://example.com/fixture/completed1.mp4",
                        "status": "completed"
                    },
                    {
                        "id": 32,
                        "storyboard_number": 2,
                        "duration": 6.0,
                        "description": "Full Episode Shot 2",
                        "video_prompt": "Cinematic Drone 2",
                        "composed_image": "/static/fixtures/shot103_2.png",
                        "video_url": "https://example.com/fixture/completed2.mp4",
                        "status": "completed"
                    }
                ]
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(shots))
                return

            if "/api/v1/merge/episodes/103/merges" in url:
                merges = [
                    {
                        "id": 601,
                        "status": "completed",
                        "merged_url": "/static/fixtures/merged_ep3.mp4"
                    }
                ]
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(merges))
                return

            # Fixture: Drama 997 with No Episodes
            if "/api/v1/dramas/997" in url and "/episodes" not in url:
                data = {
                    "id": 997,
                    "title": "Drama Without Episodes",
                    "description": "No episodes brief",
                    "episodes": []
                }
                await route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
                return

            # Fixture: Drama 996 (500 retry test)
            if "/api/v1/dramas/996" in url and "/episodes" not in url:
                mock_state["drama_996_attempts"] += 1
                if mock_state["drama_996_attempts"] == 1:
                    await route.fulfill(status=500, content_type="application/json", body=json.dumps({"message": "Simulated drama 500 error"}))
                    return
                else:
                    data = {
                        "id": 996,
                        "title": "Recovered Drama 996",
                        "description": "Recovered description after retry",
                        "episodes": [{"id": 109, "episode_number": 1, "duration": 15}]
                    }
                    await route.fulfill(status=200, content_type="application/json", body=json.dumps(data))
                    return

            if "/api/v1/episodes/109/storyboards" in url:
                mock_state["ep_109_shots_attempts"] += 1
                if mock_state["ep_109_shots_attempts"] == 1:
                    await route.fulfill(status=500, content_type="application/json", body=json.dumps({"message": "Simulated shots 500 error"}))
                    return
                else:
                    shots = [
                        {
                            "id": 91,
                            "storyboard_number": 1,
                            "duration": 4.0,
                            "description": "Recovered Shot 1",
                            "video_prompt": "Recovered Prompt",
                            "status": "completed"
                        }
                    ]
                    await route.fulfill(status=200, content_type="application/json", body=json.dumps(shots))
                    return
            if "/api/v1/merge/episodes/109/merges" in url:
                await route.fulfill(status=200, content_type="application/json", body=json.dumps([]))
                return

            await route.continue_()

        await page.route("**/api/v1/**", handle_api_route)

        # -----------------------------------------------------------------
        # TEST CASE 1: Populated Shot Fallback & Escaping (Item 1 & Item 5)
        # -----------------------------------------------------------------
        print("\n--- Test Case 1: Populated Shot Fallbacks & Escaping ---")
        await page.goto(f"{BASE_URL}/drama/999/story", wait_until="networkidle")
        await page.wait_for_selector(".story-content", timeout=6000)

        # 1.1 Verify Shot 2 prompt fallback (empty video_prompt -> image_prompt)
        shot_prompts = await page.locator(".shot-prompt-text").all_inner_texts()
        print(f"Shot prompt texts observed: {shot_prompts}")
        assert any("Fallback Image Prompt Shot 2" in p for p in shot_prompts), f"Fallback image prompt not rendered in shot card: {shot_prompts}"
        record("Prompt Fallback to Image Prompt", "PASS", "Rendered 'Fallback Image Prompt Shot 2' when video_prompt was whitespace")

        # 1.2 Verify Shot 2 image fallback (empty composed_image -> first_frame_image)
        shot_images = await page.locator("img.shot-media").all()
        shot_img_srcs = [await img.get_attribute("src") for img in shot_images]
        print(f"Shot img srcs observed: {shot_img_srcs}")
        assert any("shot2_frame.png" in (s or "") for s in shot_img_srcs), f"Fallback first_frame_image not rendered: {shot_img_srcs}"
        record("Image Fallback to First Frame Image", "PASS", "Rendered '/static/fixtures/shot2_frame.png' when composed_image was empty")

        # 1.3 Verify Shot 1 description escaping (Item 5)
        shot1_desc = await page.locator(".shot-action-text").first.inner_text()
        assert "<script>" in shot1_desc, f"Shot description markup missing or altered: {shot1_desc}"
        shot_xss_state = await page.evaluate("() => Boolean(window.__SHOT_XSS__)")
        assert not shot_xss_state, "XSS in shot description executed! window.__SHOT_XSS__ is True"
        record("Shot Description XSS Protection", "PASS", "Malicious script in shot description remained unexecuted plain text")

        # 1.4 Partial Readiness Verification (Item 2: partial fixture retains 33% video completion)
        readiness_badge = await page.locator(".ep-stats-summary .stat-badge").nth(1).inner_text()
        assert "33%" in readiness_badge, f"Expected 33% readiness for partial episode, got: {readiness_badge}"
        record("Partial Readiness Accuracy", "PASS", f"Retained 33% for partial episode ({readiness_badge})")

        # 1.5 Exact Duration Assertion (11.0s storyboard sum ignoring legacy 45m episode duration)
        duration_badge = await page.locator(".ep-stats-summary .stat-badge").first.inner_text()
        assert "11" in duration_badge and ("วินาที" in duration_badge or "00:11" in duration_badge), f"Duration mismatch: {duration_badge}"
        record("Exact Storyboard Duration Sum", "PASS", f"Duration: {duration_badge}")

        # 1.6 Readonly Story Brief & Disabled Pending AI Action
        brief_textarea = page.locator("#story-brief-display")
        assert await brief_textarea.get_attribute("readonly") is not None, "Story brief textarea is not readonly"
        ai_btn = page.locator(".pending-ai-btn")
        assert await ai_btn.is_disabled(), "Pending AI button is not disabled"
        assert await ai_btn.get_attribute("aria-disabled") == "true", "Pending AI button aria-disabled missing"
        record("Readonly Brief & Disabled AI Action", "PASS", "Textarea is readonly; AI Plan button is disabled with aria-disabled='true'")

        # 1.7 Unsafe Media URL Rejection (Shot 3)
        shot3_card = page.locator(".shot-card").nth(2)
        shot3_placeholder = shot3_card.locator(".media-placeholder")
        assert await shot3_placeholder.count() > 0, "Placeholder missing for shot 3 with unsafe URLs"
        record("Unsafe Media URL Rejection", "PASS", "javascript: and //evil.com rejected; placeholder shown")

        # -----------------------------------------------------------------
        # TEST CASE 2: Merge 500 Error, Shots Retained, Retry (Item 3)
        # -----------------------------------------------------------------
        print("\n--- Test Case 2: Merge GET 500 Error & Independent Retry ---")
        # In first load of Episode 101, merge returned 500:
        # Assert shots stay visible:
        shots_count = await page.locator(".shot-card").count()
        assert shots_count == 3, f"Shots were dropped during merge failure: count={shots_count}"

        # Assert .merge-error-box exists:
        merge_error_box = page.locator(".merge-error-box")
        assert await merge_error_box.count() > 0, ".merge-error-box element missing during merge 500 failure"
        merge_err_msg = await merge_error_box.locator(".error-msg").inner_text()
        assert "Simulated merge 500" in merge_err_msg or len(merge_err_msg) > 0, f"Merge error message unexpected: {merge_err_msg}"
        record("Merge Error Banner & Shots Preservation", "PASS", f"Shots retained (3); error displayed: {merge_err_msg}")

        # Click retryMerge button:
        retry_merge_btn = merge_error_box.locator("button")
        await retry_merge_btn.click()

        # Wait for final video player to appear and merge error box to disappear:
        await page.wait_for_selector(".final-video-player", timeout=5000)
        assert await page.locator(".merge-error-box").count() == 0, ".merge-error-box should disappear after retry"
        final_video_src = await page.locator(".final-video-player").get_attribute("src")
        assert "merged_ep1.mp4" in (final_video_src or ""), f"Final video source mismatch after retry: {final_video_src}"
        record("Merge Error Retry Recovery", "PASS", f"Final video loaded after retry: {final_video_src}")

        shot1_path = os.path.join(RUN_DIR, "01_populated_and_merge_recovered.png")
        await page.screenshot(path=shot1_path, full_page=True)

        # -----------------------------------------------------------------
        # TEST CASE 3: Completed Fixture -> 100% Completion (Item 2)
        # -----------------------------------------------------------------
        print("\n--- Test Case 3: Completed Fixture 100% Completion ---")
        ep_pills = page.locator(".ep-pill-btn")
        # Click EP 03 (completed fixture)
        await ep_pills.nth(2).click()
        await page.wait_for_selector(".shot-card", timeout=5000)
        ep3_readiness = await page.locator(".ep-stats-summary .stat-badge").nth(1).inner_text()
        assert "100%" in ep3_readiness, f"Expected 100% readiness for complete episode, got: {ep3_readiness}"
        record("Complete Readiness Accuracy", "PASS", f"100% readiness confirmed on fully completed episode: {ep3_readiness}")

        shot3_path = os.path.join(RUN_DIR, "03_completed_episode_100pct.png")
        await page.screenshot(path=shot3_path, full_page=True)

        # -----------------------------------------------------------------
        # TEST CASE 3b: Empty Shots State (Episode 102)
        # -----------------------------------------------------------------
        print("\n--- Test Case 3b: Empty Shots State (Episode 102) ---")
        await ep_pills.nth(1).click()
        await page.wait_for_selector(".state-box", timeout=5000)
        empty_shots_msg = await page.locator(".state-box p").inner_text()
        assert "ไม่พบช็อต" in empty_shots_msg, f"Unexpected empty shots message: {empty_shots_msg}"
        record("Empty Shots State (Episode 102)", "PASS", empty_shots_msg)

        # Switch back to EP 01 to prepare for overlapping race test
        await ep_pills.nth(0).click()
        await page.wait_for_selector(".shot-card", timeout=5000)

        # -----------------------------------------------------------------
        # TEST CASE 4: Overlapping Episode Selection Race (Item 4)
        # -----------------------------------------------------------------
        print("\n--- Test Case 4: Overlapping Episode Selection Race ---")
        mock_state["delay_ep_102"] = True
        mock_state["ep_102_started_event"].clear()

        # Click EP 02 (slow, triggers 1.0s delay in route handler)
        print("[RACE TEST] Clicking EP 02...")
        await ep_pills.nth(1).click()

        # Confirm the backend request callback actually began before switching back!
        try:
            await asyncio.wait_for(mock_state["ep_102_started_event"].wait(), timeout=3.0)
            print("[RACE TEST] Confirmed: Delayed EP 102 route handler is active!")
            record("Async Race Setup Confirmation", "PASS", "Delayed EP 102 route callback confirmed active before re-selection")
        except asyncio.TimeoutError:
            record("Async Race Setup Confirmation", "FAIL", "Timed out waiting for EP 102 route handler to begin")
            raise

        # Now immediately switch back to EP 01 (fast)
        print("[RACE TEST] Switching back to EP 01 while EP 102 is inflight...")
        await ep_pills.nth(0).click()

        # Wait 1.4s for the slow EP 102 callback to finish delayed dispatch
        await asyncio.sleep(1.4)

        # Verify that EP 01 shots remain displayed and were not overwritten by late EP 102 response
        ep1_shots = await page.locator(".shot-card").count()
        assert ep1_shots == 3, f"Race condition failure! Shots count overwritten to: {ep1_shots}"
        active_ep = await page.locator(".ep-pill-btn.active").inner_text()
        assert "01" in active_ep, f"Active tab mismatch: {active_ep}"
        record("Episode Token Race Guard", "PASS", f"Delayed EP 102 response safely dropped; {ep1_shots} shots from EP 01 preserved")

        # -----------------------------------------------------------------
        # TEST CASE 4b: Drama With No Episodes (Drama 997)
        # -----------------------------------------------------------------
        print("\n--- Test Case 4b: Drama With No Episodes (Drama 997) ---")
        await page.goto(f"{BASE_URL}/drama/997/story", wait_until="networkidle")
        await page.wait_for_selector(".state-box", timeout=5000)
        no_ep_msg = await page.locator(".state-box p").inner_text()
        assert "ไม่พบตอน" in no_ep_msg, f"Unexpected no-episodes message: {no_ep_msg}"
        record("No Episodes State (Drama 997)", "PASS", no_ep_msg)

        # -----------------------------------------------------------------
        # TEST CASE 4c: Drama 500 Retry & Episode Shots 500 Retry (Drama 996)
        # -----------------------------------------------------------------
        print("\n--- Test Case 4c: Drama 500 Retry & Episode Shots 500 Retry ---")
        await page.goto(f"{BASE_URL}/drama/996/story", wait_until="networkidle")
        await page.wait_for_selector(".error-box", timeout=5000)
        drama_err_msg = await page.locator(".error-msg").inner_text()
        assert "Simulated drama 500" in drama_err_msg, f"Unexpected drama error: {drama_err_msg}"
        record("Drama GET 500 Error Display", "PASS", drama_err_msg)

        # Retry Drama load
        await page.locator(".error-box .btn-primary").click()

        # Episode 109 initial storyboards request will return 500
        await page.wait_for_selector(".error-box", timeout=5000)
        ep_err_msg = await page.locator(".error-msg").inner_text()
        assert "Simulated shots 500" in ep_err_msg, f"Unexpected episode error: {ep_err_msg}"
        record("Episode Shots GET 500 Error Display", "PASS", ep_err_msg)

        # Retry Episode shots
        await page.locator(".error-box .btn-primary").click()
        await page.wait_for_selector(".shot-card", timeout=5000)
        recovered_shot = await page.locator(".shot-action-text").inner_text()
        assert "Recovered Shot 1" in recovered_shot, f"Recovery failed: {recovered_shot}"
        record("Episode Shots GET 500 Retry Recovery", "PASS", recovered_shot)

        # -----------------------------------------------------------------
        # TEST CASE 5: Actual Existing Project Drama /drama/2/story (Item 5 & Media Acceptance)
        # -----------------------------------------------------------------
        print("\n--- Test Case 5: Real Project Drama /drama/2/story & Real Media Acceptance ---")
        resp = await page.goto(f"{BASE_URL}/drama/2/story", wait_until="networkidle")
        assert resp is not None and resp.status == 200, f"Failed to load /drama/2/story: status {resp.status if resp else 'None'}"
        await page.wait_for_selector(".story-content", timeout=6000)

        # SAVE USER ARTIFACT FIRST: Screenshot of actual /drama/2/story BEFORE detail navigation
        actual_drama_screenshot = os.path.join(RUN_DIR, "actual_drama_2_story.png")
        await page.screenshot(path=actual_drama_screenshot, full_page=True)
        print(f"Saved actual /drama/2/story screenshot: {actual_drama_screenshot}")

        # Visual layout / padding / spacing check on main cards
        card_styles = await page.evaluate("""() => {
            const finalCard = document.querySelector('.final-video-card');
            const shotCard = document.querySelector('.shot-card');
            const briefCard = document.querySelector('.brief-card');
            const epCard = document.querySelector('.ep-selector-card');
            const shotsGrid = document.querySelector('.shots-grid');
            const getPadTop = el => el ? parseFloat(window.getComputedStyle(el).paddingTop) || 0 : 0;
            const getPadLeft = el => el ? parseFloat(window.getComputedStyle(el).paddingLeft) || 0 : 0;
            const getGap = el => el ? parseFloat(window.getComputedStyle(el).gap) || 0 : 0;
            return {
                finalPadTop: getPadTop(finalCard),
                finalPadLeft: getPadLeft(finalCard),
                shotPadTop: getPadTop(shotCard),
                shotPadLeft: getPadLeft(shotCard),
                briefPadTop: getPadTop(briefCard),
                briefPadLeft: getPadLeft(briefCard),
                epCardGap: getGap(epCard),
                shotsGridGap: getGap(shotsGrid),
                rawFinalPad: finalCard ? window.getComputedStyle(finalCard).padding : null,
                rawShotPad: shotCard ? window.getComputedStyle(shotCard).padding : null,
            };
        }""")
        assert card_styles["finalPadTop"] > 0 and card_styles["finalPadLeft"] > 0, f"Final card padding not > 0: {card_styles}"
        assert card_styles["shotPadTop"] > 0 and card_styles["shotPadLeft"] > 0, f"Shot card padding not > 0: {card_styles}"
        assert card_styles["briefPadTop"] > 0 and card_styles["briefPadLeft"] > 0, f"Brief card padding not > 0: {card_styles}"
        assert card_styles["epCardGap"] > 0 or card_styles["shotsGridGap"] > 0, f"Card/grid gap not > 0: {card_styles}"
        record("Visual Main-Card Styles & Spacing", "PASS", f"Card paddings: final={card_styles.get('rawFinalPad')}, shot={card_styles.get('rawShotPad')}, gridGap={card_styles.get('shotsGridGap')}px")

        # Assert expected real title and episode count
        real_title = await page.locator(".page-title").inner_text()
        print(f"Real drama title: {real_title}")
        assert len(real_title) > 0, "Real drama title is empty"

        real_ep_pills = await page.locator(".ep-pill-btn").all()
        assert len(real_ep_pills) >= 1, f"Expected at least 1 episode pill on drama 2, found {len(real_ep_pills)}"

        # Assert 3 first-episode cards and 30 seconds duration
        real_shots_count = await page.locator(".shot-card").count()
        assert real_shots_count == 3, f"Expected 3 storyboard cards on drama 2 EP 1, found {real_shots_count}"

        real_duration_text = await page.locator(".ep-stats-summary .stat-badge").first.inner_text()
        assert "30" in real_duration_text and "วินาที" in real_duration_text, f"Expected 30 seconds duration, found: {real_duration_text}"
        record("Real Drama Content Verification", "PASS", f"Title: '{real_title}', {real_shots_count} cards, {real_duration_text}")

        # -------------------------------------------------------------
        # Real Media Acceptance: All 4 videos (1 final + 3 shot videos)
        # -------------------------------------------------------------
        print("\n--- Real Media Acceptance (HTTP, Metadata, Playback) ---")
        final_video_el = page.locator(".final-video-player")
        assert await final_video_el.count() > 0, "Final video player not rendered on drama 2"
        shot_video_els = await page.locator(".shot-media-box video").all()
        assert len(shot_video_els) == 3, f"Expected 3 shot video elements, found {len(shot_video_els)}"

        all_video_locators = [final_video_el] + [page.locator(".shot-media-box video").nth(i) for i in range(3)]
        media_facts = []

        for idx, v_loc in enumerate(all_video_locators):
            v_name = "Final Merged Video" if idx == 0 else f"Shot {idx} Video"
            src = await v_loc.get_attribute("src")
            print(f"[{v_name}] src: {src}")

            # 1. Path format: Starts with /static/ and strictly NO duplicate /static/static/
            assert src and src.startswith("/static/"), f"{v_name} src does not start with /static/: {src}"
            assert "/static/static/" not in src, f"{v_name} contains duplicate static path: {src}"

            # 2. HTTP response: Test real HTTP 200 / 206 video content
            full_media_url = f"{BASE_URL}{src}" if src.startswith("/") else src
            http_status = None
            content_type = ""
            try:
                media_req = urllib.request.Request(full_media_url, headers={"Range": "bytes=0-1024", "User-Agent": "QA-Media-Auditor"})
                with urllib.request.urlopen(media_req, timeout=5) as media_resp:
                    http_status = media_resp.status
                    content_type = media_resp.headers.get("Content-Type", "")
            except Exception as e:
                raise AssertionError(f"HTTP fetch failed for {v_name} ({full_media_url}): {e}")

            assert http_status in (200, 206), f"{v_name} returned unexpected HTTP status: {http_status}"
            assert "video" in content_type or "application/octet-stream" in content_type, f"{v_name} invalid content-type: {content_type}"

            # 3. Metadata loading: Wait for readyState >= 1, finite positive duration, positive dimensions, no media error
            meta = await v_loc.evaluate("""v => new Promise(resolve => {
                const getMeta = () => ({
                    readyState: v.readyState,
                    duration: v.duration,
                    isFiniteDuration: Number.isFinite(v.duration),
                    videoWidth: v.videoWidth,
                    videoHeight: v.videoHeight,
                    error: v.error ? v.error.message : null
                });
                if (v.readyState >= 1) {
                    return resolve(getMeta());
                }
                v.addEventListener('loadedmetadata', () => {
                    resolve(getMeta());
                }, { once: true });
                setTimeout(() => {
                    resolve(getMeta());
                }, 4000);
            })""")

            assert meta["readyState"] >= 1, f"{v_name} readyState < 1 (stuck at {meta['readyState']}): {src}"
            assert math.isfinite(meta["duration"]) and meta["duration"] > 0, f"{v_name} duration is not positive finite: {meta['duration']}"
            assert meta["videoWidth"] > 0 and meta["videoHeight"] > 0, f"{v_name} dimensions not positive: {meta['videoWidth']}x{meta['videoHeight']}"
            assert meta["error"] is None, f"{v_name} has media error: {meta['error']}"

            media_facts.append({
                "video": v_name,
                "src": src,
                "http_status": http_status,
                "content_type": content_type,
                "readyState": meta["readyState"],
                "duration": round(meta["duration"], 2),
                "resolution": f"{meta['videoWidth']}x{meta['videoHeight']}",
            })

        record("Real Media HTTP & Metadata Validation", "PASS", f"All 4 videos loaded successfully without double static (HTTP 200/206, readyState >= 1, duration finite > 0, valid dimensions)")

        # 4. Actuate local media playback on final video to prove currentTime advances (final video only)
        play_result = await final_video_el.evaluate("""async v => {
            try {
                v.muted = true;
                await v.play();
                await new Promise(r => setTimeout(r, 600));
                const advanced = v.currentTime > 0;
                const cur = v.currentTime;
                const dur = v.duration;
                v.pause();
                return { success: true, advanced, currentTime: cur, duration: dur };
            } catch (err) {
                return { success: false, error: String(err) };
            }
        }""")

        assert play_result.get("success") is True, f"Playback invocation failed: {play_result.get('error')}"
        assert play_result.get("advanced") is True, f"Video currentTime did not advance: {play_result}"
        record("Final Video Real Playback Actuation (Final Video Only)", "PASS", f"Playback advanced to {round(play_result['currentTime'], 3)}s (duration {round(play_result['duration'], 2)}s)")

        # Save real frame screenshot after metadata and playback actuation
        playback_screenshot = os.path.join(RUN_DIR, "actual_drama_2_story_playback.png")
        await page.screenshot(path=playback_screenshot, full_page=True)
        print(f"Saved real frame playback screenshot: {playback_screenshot}")

        # Follow existing studio navigation and assert correct URL (after pausing)
        studio_btn = page.locator(".studio-link-btn")
        await studio_btn.click()
        await page.wait_for_url("**/drama/2/episode/1", timeout=5000)
        assert "/drama/2/episode/1" in page.url, f"Studio navigation did not reach /drama/2/episode/1, current: {page.url}"
        record("Real Drama Studio Navigation", "PASS", f"Navigated successfully to: {page.url}")

        # Detail page entry button verification
        await page.goto(f"{BASE_URL}/drama/2", wait_until="networkidle")
        entry_btn = page.locator(".story-mode-entry-btn")
        assert await entry_btn.count() > 0, "Story mode entry button missing on /drama/2 detail page"
        record("Real Drama Detail Entry Button", "PASS", "Verified .story-mode-entry-btn on /drama/2")

        # -----------------------------------------------------------------
        # TEST CASE 6: Zero Mutation Verification
        # -----------------------------------------------------------------
        print("\n--- Test Case 6: Zero Mutation Verification ---")
        assert len(mutations_detected) == 0, f"MUTATIONS DETECTED: {mutations_detected}"
        record("Zero Mutation Enforcement", "PASS", "Strictly zero POST/PUT/PATCH/DELETE calls observed")

    except Exception as exc:
        print(f"\n[ERROR OCCURRED DURING RUN]: {exc}")
        record("Unhandled Test Failure", "FAIL", str(exc))
        if page:
            err_shot = os.path.join(RUN_DIR, "failure_diagnostic.png")
            await page.screenshot(path=err_shot, full_page=True)
            print(f"Captured failure diagnostic screenshot: {err_shot}")
        raise

    finally:
        trace_path = os.path.join(RUN_DIR, "trace.zip")
        if context:
            await context.tracing.stop(path=trace_path)
            print(f"Tracing saved to: {trace_path}")
        if browser:
            await browser.close()
        await playwright.stop()

        passed_count = len([r for r in test_results if r["status"] == "PASS"])
        failed_count = len([r for r in test_results if r["status"] == "FAIL"])
        overall_verdict = "PASS" if (failed_count == 0 and passed_count > 0) else "FAIL"

        summary = {
            "verdict": overall_verdict,
            "run_dir": RUN_DIR,
            "timestamp": RUN_TIMESTAMP,
            "launch_mode": launch_mode,
            "total_checks": len(test_results),
            "passed_checks": passed_count,
            "failed_checks": failed_count,
            "mutations_blocked": len(mutations_detected),
            "results": test_results,
            "media_facts": media_facts,
            "artifacts": {
                "run_dir": RUN_DIR,
                "actual_drama_screenshot": os.path.join(RUN_DIR, "actual_drama_2_story.png"),
                "actual_drama_playback_screenshot": os.path.join(RUN_DIR, "actual_drama_2_story_playback.png"),
                "trace": trace_path
            }
        }

        with open(os.path.join(RUN_DIR, "qa_run_summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

        with open(os.path.join(ARTIFACTS_BASE_DIR, "qa_run_summary.json"), "w") as f:
            json.dump(summary, f, indent=2)

        print("\n=== QA Recheck Run Summary ===")
        print(f"Verdict: {overall_verdict} ({passed_count} PASS, {failed_count} FAIL)")
        print(f"Artifacts preserved in: {RUN_DIR}")

if __name__ == "__main__":
    asyncio.run(run_qa())
