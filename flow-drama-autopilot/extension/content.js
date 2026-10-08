// Google Flow Drama Auto-Pilot Content Script
(() => {
  if (document.getElementById("fap-container")) return;

  // State management
  let isRunning = false;
  let shouldStop = false;
  let currentSceneIndex = 0;
  let scriptData = null;

  // Sample Drama Script for Instant Testing
  const defaultSampleDrama = {
    title: "เงาในเงามืด (Shadow of Truth)",
    characters: [
      {
        tag: "@Danai",
        description: "Thai detective, 35 years old, messy black hair, beige trench coat, sharp observant eyes"
      }
    ],
    scenes: [
      {
        scene_id: 1,
        character: "@Danai",
        prompt: "@Danai standing alone in a dark alley at night under cinematic streetlamp, light rain falling, photorealistic 4k, cinematic camera tracking",
        dialogue: "มีบางอย่างในเงามืดที่ไม่ถูกต้อง...",
        duration: 5
      },
      {
        scene_id: 2,
        character: "@Danai",
        prompt: "Close up of @Danai holding a mysterious glowing USB drive, intense facial expression, cinematic shallow depth of field",
        dialogue: "หลักฐานชิ้นนี้ มันอันตรายเกินไป",
        duration: 5
      },
      {
        scene_id: 3,
        character: "@Danai",
        prompt: "@Danai quickly running into a waiting black sedan, headlights turning on in the rain, dramatic action angle",
        dialogue: "ต้องรีบไปจากที่นี่ เดี๋ยวนี้!",
        duration: 5
      }
    ]
  };

  // Build Floating UI
  function createUI() {
    const container = document.createElement("div");
    container.id = "fap-container";
    container.innerHTML = `
      <div class="fap-header" id="fap-drag-handle">
        <div class="fap-title">
          <span>🎬</span>
          <span>Google Flow Auto-Pilot</span>
          <span class="fap-title-badge">v1.0</span>
        </div>
        <div class="fap-header-actions">
          <button class="fap-icon-btn" id="fap-btn-min" title="ย่อ/ขยาย">—</button>
        </div>
      </div>
      <div id="fap-body">
        <div class="fap-section">
          <div class="fap-label">
            <span>บทละครสั้น (Drama Script JSON)</span>
            <button class="fap-icon-btn" id="fap-btn-load-sample" style="font-size: 11px; padding: 2px 6px;">โหลดตัวอย่าง</button>
          </div>
          <textarea class="fap-textarea" id="fap-input-json" placeholder="วางบทละคร JSON ที่สร้างจาก AI ที่นี่...">${JSON.stringify(defaultSampleDrama, null, 2)}</textarea>
        </div>

        <div class="fap-status-card">
          <div class="fap-status-row">
            <span>สถานะ:</span>
            <span class="fap-status-val" id="fap-status-text">พร้อมทำงาน (Idle)</span>
          </div>
          <div class="fap-status-row">
            <span>ซีนปัจจุบัน:</span>
            <span class="fap-status-val" id="fap-scene-counter">0 / 0</span>
          </div>
          <div class="fap-progress-bar-bg">
            <div class="fap-progress-bar-fill" id="fap-progress-bar"></div>
          </div>
        </div>

        <div class="fap-btn-group">
          <button class="fap-btn fap-btn-primary" id="fap-btn-start">
            <span>▶</span>
            <span>เริ่มสร้างวิดีโออัตโนมัติ</span>
          </button>
          <button class="fap-btn fap-btn-danger" id="fap-btn-stop" disabled>
            <span>⏹</span>
            <span>หยุด</span>
          </button>
        </div>

        <div class="fap-section">
          <div class="fap-label">
            <span>บันทึกการทำงาน (Live Activity Log)</span>
            <button class="fap-icon-btn" id="fap-btn-clear-log" style="font-size: 11px; padding: 2px 6px;">ล้าง</button>
          </div>
          <div class="fap-log-box" id="fap-log-box"></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    setupEvents(container);
    log("🚀 Google Flow Drama Auto-Pilot โหลดสำเร็จพร้อมใช้งาน!", "info");
  }

  // Logger helper
  function log(msg, type = "normal") {
    const box = document.getElementById("fap-log-box");
    if (!box) return;
    const item = document.createElement("div");
    item.className = `fap-log-item ${type}`;
    const time = new Date().toLocaleTimeString("th-TH", { hour12: false });
    item.textContent = `[${time}] ${msg}`;
    box.appendChild(item);
    box.scrollTop = box.scrollHeight;
  }

  // Event Listeners & Dragging
  function setupEvents(container) {
    const btnMin = container.querySelector("#fap-btn-min");
    const btnStart = container.querySelector("#fap-btn-start");
    const btnStop = container.querySelector("#fap-btn-stop");
    const btnLoadSample = container.querySelector("#fap-btn-load-sample");
    const btnClearLog = container.querySelector("#fap-btn-clear-log");
    const inputJson = container.querySelector("#fap-input-json");
    const dragHandle = container.querySelector("#fap-drag-handle");

    // Minimize / Expand
    btnMin.addEventListener("click", () => {
      container.classList.toggle("fap-minimized");
      btnMin.textContent = container.classList.contains("fap-minimized") ? "□" : "—";
    });

    // Load sample
    btnLoadSample.addEventListener("click", () => {
      inputJson.value = JSON.stringify(defaultSampleDrama, null, 2);
      log("โหลดข้อมูลตัวอย่างเรียบร้อย", "info");
    });

    // Clear logs
    btnClearLog.addEventListener("click", () => {
      document.getElementById("fap-log-box").innerHTML = "";
    });

    // Start Auto-Pilot
    btnStart.addEventListener("click", async () => {
      try {
        scriptData = JSON.parse(inputJson.value);
        if (!scriptData.scenes || !Array.isArray(scriptData.scenes) || scriptData.scenes.length === 0) {
          alert("กรุณาระบุ scenes ใน JSON ให้ถูกต้อง");
          return;
        }
      } catch (err) {
        alert("JSON รูปแบบไม่ถูกต้อง: " + err.message);
        return;
      }

      isRunning = true;
      shouldStop = false;
      btnStart.disabled = true;
      btnStop.disabled = false;
      inputJson.disabled = true;

      log(`🎬 เริ่มต้นการสร้างละครเรื่อง: "${scriptData.title || 'Untitled'}" จำนวน ${scriptData.scenes.length} ซีน`, "info");
      await runAutoPilot();
    });

    // Stop Auto-Pilot
    btnStop.addEventListener("click", () => {
      shouldStop = true;
      log("⏹ ผู้ใช้กดหยุดการทำงาน...", "warn");
      updateStatus("กำลังหยุด...");
    });

    // Simple Dragging
    let isDragging = false;
    let startX, startY, initialX, initialY;

    dragHandle.addEventListener("mousedown", (e) => {
      if (e.target.closest("button")) return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      dragHandle.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      container.style.left = `${initialX + dx}px`;
      container.style.top = `${initialY + dy}px`;
      container.style.right = "auto";
      container.style.bottom = "auto";
    });

    window.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        dragHandle.style.cursor = "grab";
      }
    });
  }

  function updateStatus(text, current = 0, total = 0) {
    document.getElementById("fap-status-text").textContent = text;
    if (total > 0) {
      document.getElementById("fap-scene-counter").textContent = `${current} / ${total}`;
      const pct = Math.round((current / total) * 100);
      document.getElementById("fap-progress-bar").style.width = `${pct}%`;
    }
  }

  // Sleep utility
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Find Prompt Input Element on Google Flow
  function findPromptInput() {
    // 1. Textarea
    const textareas = Array.from(document.querySelectorAll("textarea"));
    for (const ta of textareas) {
      if (ta.offsetParent !== null && !ta.closest("#fap-container")) {
        return ta;
      }
    }

    // 2. Contenteditable
    const editables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
    for (const ed of editables) {
      if (ed.offsetParent !== null && !ed.closest("#fap-container")) {
        return ed;
      }
    }

    // 3. Inputs
    const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
    for (const inp of inputs) {
      if (inp.offsetParent !== null && !inp.closest("#fap-container")) {
        return inp;
      }
    }

    return null;
  }

  // Set Value into Prompt Input properly with React/Lit/Angular events
  async function setPromptValue(element, text) {
    element.focus();
    await sleep(200);

    if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    } else if (element.isContentEditable) {
      element.innerText = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    await sleep(300);
  }

  // Find Generate / Submit Button
  function findGenerateButton() {
    const buttons = Array.from(document.querySelectorAll("button"));
    // Look for submit or generate buttons
    for (const btn of buttons) {
      if (btn.closest("#fap-container")) continue;
      if (btn.offsetParent === null) continue;

      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const txt = (btn.textContent || "").trim().toLowerCase();

      if (
        aria.includes("generate") || aria.includes("สร้าง") || aria.includes("submit") ||
        txt.includes("generate") || txt.includes("สร้าง") || txt.includes("run")
      ) {
        return btn;
      }

      // Check for SVG icon button near input
      if (btn.querySelector("svg") && btn.closest('form, [role="region"], div[class*="prompt" i], div[class*="input" i]')) {
        return btn;
      }
    }
    return null;
  }

  // Polling for generation completion & triggering download
  async function waitForGenerationAndDownload(sceneNum) {
    log(`⏳ กำลังรอให้คลิปซีนที่ ${sceneNum} สร้างเสร็จ...`, "info");
    const startTime = Date.now();
    const maxTimeoutMs = 180000; // 3 minutes timeout

    // Record existing video elements count to detect new one
    const initialVideos = document.querySelectorAll("video").length;

    while (Date.now() - startTime < maxTimeoutMs) {
      if (shouldStop) return false;

      // Check if a new video appeared or download button is visible
      const videos = document.querySelectorAll("video");
      const downloadBtns = Array.from(document.querySelectorAll('button, a[download]')).filter(el => {
        const txt = (el.textContent || el.getAttribute("aria-label") || "").toLowerCase();
        return txt.includes("download") || txt.includes("ดาวน์โหลด");
      });

      // If new video loaded with src
      if (videos.length > initialVideos || downloadBtns.length > 0) {
        const latestVideo = videos[videos.length - 1];
        if (latestVideo && latestVideo.src && latestVideo.src.startsWith("http")) {
          log(`✅ ซีนที่ ${sceneNum} สร้างสำเร็จ! เริ่มดาวน์โหลด...`, "success");
          downloadVideo(latestVideo.src, `scene_${String(sceneNum).padStart(2, "0")}.mp4`);
          await sleep(3000);
          return true;
        }

        if (downloadBtns.length > 0) {
          const btn = downloadBtns[downloadBtns.length - 1];
          log(`✅ พบปุ่มดาวน์โหลดสำหรับซีนที่ ${sceneNum}! คลิกดาวน์โหลด...`, "success");
          btn.click();
          await sleep(3000);
          return true;
        }
      }

      await sleep(3000);
    }

    log(`⚠️ ซีนที่ ${sceneNum} ใช้เวลานานเกินกำหนด (Timeout)`, "warn");
    return false;
  }

  // Trigger download via Chrome runtime or local anchor
  function downloadVideo(url, filename) {
    if (chrome && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({
        action: "download_video",
        url: url,
        filename: filename
      }, (res) => {
        if (res && res.success) {
          log(`📥 สั่งดาวน์โหลดผ่าน Extension สำเร็จ: ${filename}`, "success");
        } else {
          fallbackDownload(url, filename);
        }
      });
    } else {
      fallbackDownload(url, filename);
    }
  }

  function fallbackDownload(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    log(`📥 ดาวน์โหลดผ่านลิงก์เว็บ: ${filename}`, "success");
  }

  // Main Loop
  async function runAutoPilot() {
    const scenes = scriptData.scenes;
    const total = scenes.length;

    for (let i = 0; i < total; i++) {
      if (shouldStop) break;

      const scene = scenes[i];
      const sceneNum = scene.scene_id || (i + 1);
      updateStatus(`กำลังประมวลผลซีน ${sceneNum}...`, i + 1, total);
      log(`🎬 [ซีนที่ ${sceneNum}/${total}] คาแรคเตอร์: ${scene.character || 'Default'}`, "info");

      // 1. Locate Prompt Input
      const inputEl = findPromptInput();
      if (!inputEl) {
        log("❌ ไม่พบช่องพิมพ์ Prompt ในหน้าเว็บ กรุณาเปิดโปรเจกต์ของ Google Flow ให้เรียบร้อย", "error");
        break;
      }

      // 2. Set Prompt Text
      log(`📝 ป้อนคำสั่ง Prompt: "${scene.prompt.substring(0, 50)}..."`);
      await setPromptValue(inputEl, scene.prompt);
      await sleep(1000);

      // 3. Find and Click Generate Button
      const genBtn = findGenerateButton();
      if (genBtn) {
        log("🚀 สั่งกดปุ่ม Generate วิดีโอ...", "info");
        genBtn.click();
      } else {
        log("⚠️ ไม่เจอปุ่ม Generate กำลังลองกด Enter...", "warn");
        inputEl.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
      }

      // 4. Wait for Video and Download
      await sleep(4000);
      await waitForGenerationAndDownload(sceneNum);

      // Delay between scenes to avoid rate limits
      if (i < total - 1 && !shouldStop) {
        log("⏸ พัก 5 วินาทีก่อนเริ่มซีนถัดไป...", "normal");
        await sleep(5000);
      }
    }

    isRunning = false;
    document.getElementById("fap-btn-start").disabled = false;
    document.getElementById("fap-btn-stop").disabled = true;
    document.getElementById("fap-input-json").disabled = false;

    if (shouldStop) {
      updateStatus("หยุดการทำงานแล้ว", 0, 0);
      log("⏹ หยุดระบบ Auto-Pilot เรียบร้อย", "warn");
    } else {
      updateStatus("เสร็จสิ้นทุกซีนแล้ว! 🎉", total, total);
      log("🎉 สร้างและดาวน์โหลดครบทุกซีนเรียบร้อยแล้ว! พร้อมนำไปตัดต่อ", "success");
    }
  }

  // Inject UI when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createUI);
  } else {
    createUI();
  }
})();
