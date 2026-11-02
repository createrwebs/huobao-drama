<template>
  <Teleport to="body">
    <div v-if="isOpen" class="vast-overlay" @click.self="handleClose">
      <div class="vast-dialog" role="dialog" aria-modal="true">
        
        <!-- Header -->
        <div class="vast-header">
          <div class="header-left">
            <div class="icon-badge">
              <Sparkles :size="20" class="text-purple-400" />
            </div>
            <div>
              <div class="header-title-row">
                <h2 class="modal-title">Vast.ai Cloud GPU Studio</h2>
                <span class="badge-tag">{{ currentModel.name }}</span>
                <span v-if="currentModel.hasAudio" class="badge-tag audio-badge">
                  <Volume2 :size="11" /> Joint Audio Sync
                </span>
                <span v-if="accountBalance" class="balance-tag" :class="{ 'is-ok': accountBalance.isReserveSufficient, 'is-warn': !accountBalance.isReserveSufficient }">
                  <Coins :size="11" />
                  ยอดคงเหลือ Vast: ${{ accountBalance.credit.toFixed(2) }}
                  <template v-if="!accountBalance.isReserveSufficient">(ขาดอีก ${{ accountBalance.shortageUsd.toFixed(2) }})</template>
                </span>
              </div>
              <p class="modal-subtitle">
                {{ stepSubtitle }}
              </p>
            </div>
          </div>
          <button type="button" class="close-btn" :disabled="isBusyBooting" @click="handleClose">
            <X :size="18" />
          </button>
        </div>

        <!-- ============================================== -->
        <!-- STEP 1: Pre-flight Configuration & Multi-Scene -->
        <!-- ============================================== -->
        <div v-if="step === 1" class="vast-body">
          
          <!-- Balance Warning (If < $20 Reserve) -->
          <div v-if="accountBalance && !accountBalance.isReserveSufficient" class="reserve-warn-banner">
            <AlertTriangle :size="18" class="text-amber-400 flex-shrink-0" />
            <div class="warn-text">
              <strong>⚠️ ยอดเงินสำรองในบัญชี Vast.ai ไม่เพียงพอ (ต้องการเงินสำรองขั้นต่ำ $20.00):</strong>
              <div>ปัจจุบันมี ${{ accountBalance.credit.toFixed(2) }} (ยังขาดอีก ${{ accountBalance.shortageUsd.toFixed(2) }}) กรุณาเติมเงินเข้าบัญชี Vast.ai ให้ครบก่อนกดยืนยันจอง เพื่อป้องกันไม่ให้ระบบตัดการทำงานกลางคัน</div>
            </div>
          </div>

          <!-- Section 1: Multi-Episode / Multi-Scene Selector -->
          <div class="section-card">
            <div class="section-card-head">
              <div class="section-card-title">
                <Layers :size="14" />
                <span>คิวช็อตวิดีโอที่เลือกเรนเดอร์ (Multi-Scene Queue)</span>
              </div>
              <div class="queue-summary-tags">
                <span class="tag-pill">เลือกทั้งหมด {{ selectedShots.length }} ช็อต</span>
                <span class="tag-pill">เวลารวม {{ totalQueueDuration }} วินาที</span>
                <span class="tag-pill" :class="{ 'ok': readyKeyframeCount === selectedShots.length, 'warn': readyKeyframeCount < selectedShots.length }">
                  ภาพ Keyframe พร้อม {{ readyKeyframeCount }}/{{ selectedShots.length }}
                </span>
              </div>
            </div>

            <!-- Episode tabs / selector -->
            <div v-if="episodesList.length > 1" class="episode-pill-bar">
              <span class="episode-pill-label">เลือกช็อตจากตอน:</span>
              <button
                v-for="ep in episodesList"
                :key="ep.id"
                type="button"
                class="ep-tab-btn"
                :class="{ 'active': activeEpisodeTabId === ep.id }"
                @click="switchEpisodeTab(ep.id)"
              >
                ตอนที่ {{ ep.episode_number || ep.id }} ({{ ep.storyboardCount || 0 }} ช็อต)
              </button>
            </div>

            <!-- Shot List Table / Inspection -->
            <div class="queue-shot-list">
              <div
                v-for="(s, idx) in currentTabShots"
                :key="s.id"
                class="queue-shot-item"
                :class="{ 'is-selected': isShotSelected(s.id), 'is-inspected': inspectedShotId === s.id }"
              >
                <div class="shot-row-main" @click="toggleShotSelection(s)">
                  <div class="shot-checkbox">
                    <input type="checkbox" :checked="isShotSelected(s.id)" class="checkbox" @click.stop="toggleShotSelection(s)" />
                  </div>
                  <div class="shot-thumb-box">
                    <img v-if="getShotImage(s)" :src="'/' + getShotImage(s).replace(/^\//, '')" class="shot-img" />
                    <div v-else class="shot-img-empty">
                      <Image :size="14" />
                    </div>
                    <span class="shot-seq">#{{ String(idx + 1).padStart(2, '0') }}</span>
                  </div>
                  <div class="shot-meta-col">
                    <div class="shot-title-line">
                      <strong>{{ s.title || `ช็อตที่ ${idx + 1}` }}</strong>
                      <span class="dur-badge">{{ s.duration || 10 }}s ({{ Math.round((s.duration || 10) * 16) + 1 }} เฟรม)</span>
                      <span v-if="getShotImage(s)" class="status-tag ok">✓ Keyframe พร้อม</span>
                      <span v-else class="status-tag warn">⚠️ ยังไม่มีภาพ</span>
                    </div>
                    <div class="shot-desc-truncate">{{ s.description || 'ไม่มีคำบรรยาย' }}</div>
                    <div class="shot-ref-line">
                      <span class="ref-label">ตัวละครอ้างอิง:</span>
                      <span class="ref-chars">{{ getShotCharNames(s) }}</span>
                    </div>
                  </div>
                  <div class="shot-actions-col">
                    <button
                      type="button"
                      class="btn-inspect-shot"
                      :class="{ active: inspectedShotId === s.id }"
                      title="ตรวจสอบ Prompt และข้อมูลอ้างอิง Reference"
                      @click.stop="toggleInspectShot(s.id)"
                    >
                      <FileText :size="12" />
                      <span>{{ inspectedShotId === s.id ? 'ซ่อน' : 'ดู Prompt & Ref' }}</span>
                    </button>
                  </div>
                </div>

                <!-- Expanded Drawer: Prompt & Reference Inspector -->
                <div v-if="inspectedShotId === s.id" class="shot-inspector-drawer" @click.stop>
                  <div class="inspector-grid">
                    <!-- Ref Column -->
                    <div class="inspector-card">
                      <div class="inspector-card-title">
                        <Sparkles :size="13" class="text-purple-400" />
                        <span>ความสมบูรณ์ของภาพอ้างอิง (Reference Fidelity)</span>
                      </div>
                      <div class="fidelity-list">
                        <div class="fidelity-item">
                          <span class="f-label">Keyframe เริ่มต้น:</span>
                          <span v-if="getShotImage(s)" class="f-badge ok">✓ พร้อมส่งเป็น Start Frame สู่ VAE (1280x720)</span>
                          <span v-else class="f-badge warn">⚠️ ไม่มีภาพเริ่มต้น (โมเดลจะใช้ Text-to-Video สุ่มฉาก)</span>
                        </div>
                        <div class="fidelity-item">
                          <span class="f-label">ตัวละครอ้างอิง:</span>
                          <div class="f-chars-tags">
                            <span v-for="c in (s.characters?.length ? s.characters : [{ name: getShotCharNames(s) }])" :key="c.name" class="f-char-tag">
                              @{{ c.name || c }} (IP-Adapter Sync)
                            </span>
                          </div>
                        </div>
                        <div class="fidelity-item">
                          <span class="f-label">มุมกล้อง / การเคลื่อนไหว:</span>
                          <span class="f-text">{{ s.movement || 'Cinematic pan & subtle push-in' }} ({{ s.angle || 'Eye-level' }})</span>
                        </div>
                        <div class="fidelity-item">
                          <span class="f-label">บรรยากาศ & แสง:</span>
                          <span class="f-text">{{ s.atmosphere || s.lighting || 'Cinematic lighting, volumetric atmosphere' }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- Prompt & Duration Column -->
                    <div class="inspector-card">
                      <div class="inspector-card-title">
                        <Sliders :size="13" class="text-purple-400" />
                        <span>การตั้งค่าระยะเวลา & Prompt ละเอียด Wan 2.1</span>
                      </div>
                      <div class="duration-tune-row">
                        <label class="dur-tune-label">ความยาวช็อต:</label>
                        <div class="dur-tune-controls">
                          <input
                            v-model.number="s.duration"
                            type="number"
                            min="3"
                            max="15"
                            step="1"
                            class="dur-tune-input"
                          />
                          <span class="dur-tune-unit">วินาที</span>
                          <span class="dur-tune-frames">
                            = {{ Math.round((s.duration || 10) * 16) + 1 }} เฟรม (16 FPS)
                          </span>
                        </div>
                      </div>

                      <div class="prompt-tune-group">
                        <label class="prompt-tune-label">Wan 2.1 Video Prompt (ส่งเข้า Text Encoder):</label>
                        <textarea
                          v-model="s.video_prompt"
                          class="prompt-tune-textarea"
                          rows="3"
                          placeholder="พรอมต์วิดีโอแบบละเอียด..."
                        ></textarea>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- Section 1.5: Model Architecture Selection (Minimax-H3 vs FastWan 2.2 vs Wan 2.1) -->
          <div class="section-card">
            <div class="section-card-head">
              <div class="section-card-title">
                <Film :size="14" />
                <span>สถาปัตยกรรมโมเดล AI (Model Architecture & Generation Mode)</span>
              </div>
              <div class="queue-summary-tags">
                <span class="tag-pill ok">โหมดที่เลือก: {{ currentModel.tag }}</span>
              </div>
            </div>

            <div class="model-mode-grid">
              <div
                v-for="m in modelModes"
                :key="m.id"
                class="model-mode-card"
                :class="{ 'is-active': selectedModelMode === m.id, 'is-rec': m.badgeClass === 'rec-badge' }"
                @click="selectedModelMode = m.id"
              >
                <div class="model-mode-top">
                  <div class="model-mode-title-row">
                    <span class="model-mode-name">{{ m.name }}</span>
                    <span class="model-mode-badge" :class="m.badgeClass">{{ m.tag }}</span>
                  </div>
                  <div class="model-mode-meta-tags">
                    <span v-if="m.hasAudio" class="meta-tag audio"><Volume2 :size="11" /> Audio ในตัว</span>
                    <span class="meta-tag speed"><Zap :size="11" /> {{ m.speedText }}</span>
                    <span class="meta-tag vram">VRAM {{ m.minVram }}</span>
                  </div>
                </div>

                <p class="model-mode-desc">{{ m.description }}</p>

                <div class="model-mode-foot">
                  <span class="model-rate-hint">ราคาประเมิน: <strong>~{{ m.estShotRate.toFixed(2) }} บ./ช็อต</strong></span>
                  <span class="mode-select-pill">{{ selectedModelMode === m.id ? '✓ เลือกโหมดนี้' : 'เลือก' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 2: Expanded GPU Catalogue (More than 3 GPUs with TFLOPS & VRAM filter) -->
          <div class="section-card">
            <div class="section-card-head">
              <div class="section-card-title">
                <Cpu :size="14" />
                <span>เลือกรุ่น GPU ตามความคุ้มค่า (TFLOPS/Hr & สเปกโมเดล)</span>
              </div>
              <!-- VRAM Tier Filter Chips -->
              <div class="tier-filter-chips">
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: gpuFilterTier === 'all' }"
                  @click="gpuFilterTier = 'all'"
                >
                  ทั้งหมด ({{ gpuCatalogue.length }})
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: gpuFilterTier === '24gb' }"
                  @click="gpuFilterTier = '24gb'"
                >
                  24GB (Wan 2.1 แนะนำ ⭐)
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: gpuFilterTier === '48gb' }"
                  @click="gpuFilterTier = '48gb'"
                >
                  48GB (งานหนักต่อเนื่อง 🚀)
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: gpuFilterTier === '80gb' }"
                  @click="gpuFilterTier = '80gb'"
                >
                  80GB (สตูดิโอไฮสปีด)
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: gpuFilterTier === '16gb' }"
                  @click="gpuFilterTier = '16gb'"
                >
                  16GB (พรีวิว/รุ่นเบา)
                </button>
              </div>
            </div>

            <!-- GPU Grid Cards -->
            <div class="gpu-grid">
              <div
                v-for="gpu in filteredGpuCatalogue"
                :key="gpu.id"
                class="gpu-select-card"
                :class="{ 'is-active': selectedGpuId === gpu.id, 'is-rec': gpu.recommended }"
                @click="selectedGpuId = gpu.id"
              >
                <div class="gpu-card-top">
                  <div class="gpu-name-group">
                    <span class="gpu-name">{{ gpu.name }}</span>
                    <span v-if="gpu.recommended" class="rec-badge">แนะนำ</span>
                  </div>
                  <div class="gpu-vram-tag">{{ gpu.vramGb }} GB VRAM</div>
                </div>

                <div class="gpu-specs-row">
                  <div class="spec-col">
                    <span class="spec-label">Compute:</span>
                    <span class="spec-val mono">{{ gpu.tflops }} TFLOPS</span>
                  </div>
                  <div class="spec-col">
                    <span class="spec-label">TFLOPS/Hr:</span>
                    <span class="spec-val mono text-accent">{{ gpu.tflopsPerDph || (gpu.tflops / gpu.medianDphUsd).toFixed(1) }}</span>
                  </div>
                </div>

                <div class="gpu-desc-text truncate">{{ gpu.description }}</div>

                <div class="gpu-card-bottom">
                  <div class="gpu-price-info">
                    <span class="dph-thb">~{{ gpu.customerDphThb }} บาท/ชม.</span>
                    <span class="shot-rate">(~{{ gpu.estPricePerShotThb }} บ./ช็อต)</span>
                  </div>
                  <span class="select-indicator">{{ selectedGpuId === gpu.id ? '✓ เลือกอยู่' : 'เลือก' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 3: Template, Vast.ai API Key & SSH Tunnel Configuration -->
          <div class="section-card">
            <div class="section-card-head">
              <div class="section-card-title">
                <HardDrive :size="14" />
                <span>การเชื่อมต่อ Vast.ai API, SSH Tunnel & พื้นที่จัดเก็บ Cloudflare R2</span>
              </div>
              <div class="queue-summary-tags">
                <span v-if="vastConnConfig.hasSshKey" class="tag-pill ok">🔑 พบ SSH Key (~/.ssh/id_ed25519.pub)</span>
                <span v-if="vastConnConfig.hasApiKey" class="tag-pill ok">✓ เชื่อมต่อ Vast API Key แล้ว ({{ vastConnConfig.maskedApiKey }})</span>
                <span v-else-if="directSshInput || directComfyInput" class="tag-pill ok">⚡ โหมดเชื่อมต่อ Direct SSH / ComfyUI</span>
                <span v-else class="tag-pill">🎬 โหมดเรนเดอร์จริงด้วย Local Cinematic Engine (ยังไม่ได้ใส่ Vast API Key)</span>
              </div>
            </div>
            <div class="config-grid" style="margin-bottom: 12px;">
              <div class="config-col">
                <label class="field-label">Vast.ai API Key (สำหรับจองเครื่องอัตโนมัติ):</label>
                <div style="display:flex; gap:6px;">
                  <input
                    v-model="apiKeyInput"
                    type="password"
                    class="input-custom"
                    style="margin-top:0; flex:1;"
                    :placeholder="vastConnConfig.hasApiKey ? `บันทึกแล้ว (${vastConnConfig.maskedApiKey}) — พิมพ์ใหม่เพื่อเปลี่ยน` : 'วาง Vast.ai API Key ที่นี่ (หรือเว้นว่างเพื่อเรนเดอร์ทันที)'"
                  />
                  <button type="button" class="btn btn-sm" :disabled="savingConnConfig" @click="saveVastConnectionConfig">
                    {{ savingConnConfig ? 'กำลังบันทึก...' : 'บันทึกคีย์' }}
                  </button>
                </div>
              </div>
              <div class="config-col">
                <label class="field-label">หรือเชื่อมต่อเครื่อง Vast.ai ที่เปิดไว้แล้ว (SSH / ComfyUI URL):</label>
                <input
                  v-model="directSshInput"
                  class="input-custom"
                  style="margin-top:0;"
                  placeholder="เช่น ssh -p 22042 root@ssh4.vast.ai หรือ http://127.0.0.1:8188"
                  @blur="saveVastConnectionConfig"
                />
              </div>
            </div>
            <div class="config-grid">
              <div class="config-col">
                <label class="field-label">Vast.ai Image / Template Hash:</label>
                <select v-model="selectedTemplate" class="select-input">
                  <option value="wan2.1_comfy_official">Wan 2.1 / MiniMax-H3 ComfyUI Serverless (Official Fast Mirror)</option>
                  <option value="aidock_comfy">ai-dock/comfyui:latest-cuda (Aria2 Multi-Connection)</option>
                  <option value="custom">กำหนด Template Hash ID เอง...</option>
                </select>
                <input
                  v-if="selectedTemplate === 'custom'"
                  v-model="customTemplateHash"
                  class="input-custom"
                  placeholder="ระบุ Template Hash ID (เช่น 7a8f9c2e...)"
                />
              </div>
              <div class="config-col">
                <label class="field-label">พื้นที่จัดเก็บ Cloudflare R2:</label>
                <div class="r2-gauge-box">
                  <div class="gauge-labels">
                    <span>โควตาฟรี 5.0 GB</span>
                    <span class="mono">{{ estimatedBatchStorageGb.toFixed(2) }} / 5.0 GB (เหลือว่าง {{ (5.0 - estimatedBatchStorageGb).toFixed(2) }} GB)</span>
                  </div>
                  <div class="gauge-bar">
                    <div class="gauge-fill" :style="{ width: Math.min(100, (estimatedBatchStorageGb / 5.0) * 100) + '%' }"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Section 4: Pricing & Margin Summary Box (+40%) -->
          <div class="pricing-box">
            <div class="pricing-box-head">
              <span class="pricing-box-title">💰 สรุปประมาณการค่าบริการเรนเดอร์สุทธิ (รวม {{ selectedShots.length }} ช็อต)</span>
              <span class="markup-tag">บวกค่าบริการระบบ & ความเสี่ยง +{{ markupPercent }}% แล้ว</span>
            </div>
            <div class="pricing-lines">
              <div class="pricing-line">
                <span>โมเดล AI ที่เลือก:</span>
                <span class="mono">{{ currentModel.name }} <template v-if="currentModel.hasAudio">(+Audio Sync)</template></span>
              </div>
              <div class="pricing-line">
                <span>GPU ที่เลือก:</span>
                <span class="mono">{{ currentSelectedGpu?.name }} ({{ currentSelectedGpu?.tflops }} TFLOPS)</span>
              </div>
              <div class="pricing-line">
                <span>ประมาณการเวลาเรนเดอร์ทั้งหมด:</span>
                <span class="mono">{{ estimatedTimeFormatted }}</span>
              </div>
              <div class="pricing-line">
                <span>ต้นทุนค่าเช่า GPU จริง (Vast.ai):</span>
                <span class="mono">~ {{ (estimatedBaseCostThb).toFixed(2) }} บาท</span>
              </div>
              <div class="pricing-line">
                <span>ค่าบริการระบบ & ความเสี่ยง (+{{ markupPercent }}%):</span>
                <span class="mono" style="color:var(--accent);">+ {{ (estimatedMarginThb).toFixed(2) }} บาท</span>
              </div>
              <div class="pricing-divider"></div>
              <div class="pricing-line total">
                <div>
                  <strong style="font-size:15px;">💎 ยอดรวมสุทธิที่หักเครดิต:</strong>
                  <div style="font-size:11px;color:var(--text-muted);font-weight:normal;">*คิดเงินจริงตามช็อตที่สำเร็จ (ช็อตละ ~{{ currentShotRateThb.toFixed(2) }} บาท) เสียไม่คิดเงิน</div>
                </div>
                <div class="total-amount">
                  ~ {{ (selectedShots.length * currentShotRateThb).toFixed(2) }} บาท
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- ============================================== -->
        <!-- STEP 2: Live Provisioning Stepper              -->
        <!-- ============================================== -->
        <div v-else-if="step === 2" class="vast-body">
          <div class="provisioning-center">
            <div class="stepper-box">
              <div class="stepper-title">กำลังเตรียมความพร้อมเซิร์ฟเวอร์ GPU On-Demand</div>
              <p class="stepper-desc">ระบบกำลังค้นหาและจับคู่โฮสต์ {{ currentSelectedGpu?.name }} ที่ดีที่สุด และดาวน์โหลดโมเดล {{ currentModel.name }} เข้าหน่วยความจำ VRAM...</p>

              <div class="stepper-list">
                <div class="step-item" :class="getStepClass(1)">
                  <div class="step-circle">
                    <Check v-if="bootSubStep > 1" :size="13" />
                    <Loader2 v-else-if="bootSubStep === 1" :size="13" class="animate-spin" />
                    <span v-else>1</span>
                  </div>
                  <div class="step-info">
                    <span class="step-name">ค้นหาและจับคู่เครื่อง GPU (TFLOPS: {{ currentSelectedGpu?.tflops }}, Reliability >= 90%)</span>
                    <span class="step-sub">{{ bootSubStep > 1 ? `จับคู่โฮสต์ #91823 (${currentSelectedGpu?.name}) สำเร็จ` : 'กำลังค้นหาข้อเสนอที่ดีที่สุด...' }}</span>
                  </div>
                </div>

                <div class="step-item" :class="getStepClass(2)">
                  <div class="step-circle">
                    <Check v-if="bootSubStep > 2" :size="13" />
                    <Loader2 v-else-if="bootSubStep === 2" :size="13" class="animate-spin" />
                    <span v-else>2</span>
                  </div>
                  <div class="step-info">
                    <span class="step-name">ตรวจสอบเงินสำรอง $20 & ออกสัญญา Contract</span>
                    <span class="step-sub">{{ bootSubStep > 2 ? 'เงินสำรองผ่านเกณฑ์! ออกสัญญา Contract #104928 เรียบร้อย' : 'กำลังยืนยันยอดเงิน...' }}</span>
                  </div>
                </div>

                <div class="step-item" :class="getStepClass(3)">
                  <div class="step-circle">
                    <Check v-if="bootSubStep > 3" :size="13" />
                    <Loader2 v-else-if="bootSubStep === 3" :size="13" class="animate-spin" />
                    <span v-else>3</span>
                  </div>
                  <div class="step-info">
                    <span class="step-name">ดาวน์โหลด Docker Container ComfyUI (Aria2 Multi-Connection)</span>
                    <span class="step-sub">{{ bootSubStep > 3 ? 'โหลด Image สำเร็จ (ความเร็ว 450 Mbps)' : 'กำลังดึง Container (82%)...' }}</span>
                  </div>
                </div>

                <div class="step-item" :class="getStepClass(4)">
                  <div class="step-circle">
                    <Check v-if="bootSubStep > 4" :size="13" />
                    <Loader2 v-else-if="bootSubStep === 4" :size="13" class="animate-spin" />
                    <span v-else>4</span>
                  </div>
                  <div class="step-info">
                    <span class="step-name">โหลดโมเดล {{ currentModel.name }} เข้า VRAM {{ currentSelectedGpu?.vramGb }}GB</span>
                    <span class="step-sub">{{ bootSubStep > 4 ? `โมเดลพร้อมทำงาน! VRAM Used: ${currentModel.minVram}` : 'กำลังโหลด Checkpoint และ Weights...' }}</span>
                  </div>
                </div>
              </div>

              <!-- Time Counter -->
              <div class="boot-time-counter">
                <span>⏱️ เวลาที่ใช้ไป: {{ formatSeconds(bootElapsedSeconds) }}</span>
                <span class="dim">|</span>
                <span>ประมาณการเวลาที่เหลือ: ~ {{ Math.max(0, 90 - bootElapsedSeconds) }} วินาที</span>
              </div>

              <!-- SSH Command & Tunnel info -->
              <div v-if="currentJob?.sshCommand" class="ssh-banner-box">
                <span class="ssh-label">🔑 SSH พอร์ต Forward:</span>
                <code class="ssh-code">{{ currentJob.sshCommand }}</code>
              </div>

              <!-- Real-time Orchestrator Logs -->
              <div v-if="currentJob?.logs?.length" class="stepper-log-scroll">
                <div v-for="(log, lIdx) in currentJob.logs.slice(-3)" :key="lIdx" class="log-item-line">
                  {{ log }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ============================================== -->
        <!-- STEP 3: Live Batch Rendering & Auto-Stop       -->
        <!-- ============================================== -->
        <div v-else-if="step === 3" class="vast-body">
          <!-- Overall Progress Bar -->
          <div class="render-header-stats">
            <div class="render-stat-item">
              <span class="stat-label">GPU Host</span>
              <span class="stat-val mono">{{ currentSelectedGpu?.name }} (#91823)</span>
            </div>
            <div class="render-stat-item">
              <span class="stat-label">สถานะปัจจุบัน</span>
              <span class="stat-val" :style="{ color: isAllDone ? '#10b981' : '#3b82f6' }">
                {{ isAllDone ? '🎉 เรนเดอร์ครบแล้ว' : `กำลังเรนเดอร์ช็อตที่ ${activeShotIndex + 1}/${selectedShots.length}` }}
              </span>
            </div>
            <div class="render-stat-item">
              <span class="stat-label">เวลาทำงาน</span>
              <span class="stat-val mono">{{ formatSeconds(renderElapsedSeconds) }}</span>
            </div>
            <div class="render-stat-item">
              <span class="stat-label">ค่าใช้จ่ายจริงปัจจุบัน</span>
              <span class="stat-val mono" style="color:var(--accent);">~ {{ currentActualChargeThb }} บาท</span>
            </div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar-labels">
              <span>ความคืบหน้าภาพรวม ({{ completedShotCount }}/{{ selectedShots.length }} ช็อต)</span>
              <span class="mono">{{ overallProgressPercent }}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" :style="{ width: overallProgressPercent + '%' }"></div>
            </div>
          </div>

          <!-- Shot-by-Shot Table -->
          <div class="render-shots-table">
            <div
              v-for="(sb, idx) in selectedShots"
              :key="sb.id"
              class="render-shot-row"
              :class="{
                'is-done': shotStates[sb.id]?.status === 'done',
                'is-rendering': shotStates[sb.id]?.status === 'rendering',
                'is-queued': !shotStates[sb.id] || shotStates[sb.id]?.status === 'queued',
              }"
            >
              <div class="shot-thumb-col">
                <img
                  v-if="getShotImage(sb)"
                  :src="'/' + getShotImage(sb).replace(/^\//, '')"
                  class="shot-img"
                  alt="Shot"
                />
                <div v-else class="shot-img-empty">
                  <Image :size="14" />
                </div>
                <span class="shot-idx">#{{ String(idx + 1).padStart(2, '0') }}</span>
              </div>
              <div class="shot-detail-col">
                <div class="shot-name-line">
                  <strong>{{ sb.title || `ช็อตที่ ${idx + 1}` }}</strong>
                  <span class="dur-badge">{{ sb.duration || 10 }}s</span>
                </div>
                <div class="shot-desc-line truncate">
                  {{ sb.description || '...' }}
                </div>
              </div>
              <div class="shot-status-col">
                <span v-if="shotStates[sb.id]?.status === 'done'" class="tag-done">
                  ✓ เสร็จสิ้น ({{ shotStates[sb.id]?.duration || 10 }}s | {{ shotStates[sb.id]?.fileSizeMb || '1.4' }} MB{{ currentModel.hasAudio ? ' + Audio' : '' }})
                </span>
                <span v-else-if="shotStates[sb.id]?.status === 'rendering'" class="tag-rendering">
                  <Loader2 :size="11" class="animate-spin" />
                  กำลังเรนเดอร์ (Step {{ shotStates[sb.id]?.step || 1 }}/{{ shotStates[sb.id]?.totalSteps || currentModel.stepCount }})
                </span>
                <span v-else class="tag-queued">
                  รอคิว...
                </span>
              </div>
            </div>
          </div>

          <!-- Auto-Stop Watchdog Banner (When Completed) -->
          <div v-if="isAllDone" class="autostop-banner">
            <div class="autostop-icon">
              <Clock :size="18" />
            </div>
            <div class="autostop-info">
              <strong>🛡️ ระบบตัดวงจรอัตโนมัติ (Auto-Stop Watchdog):</strong>
              <div>เรนเดอร์ครบทุกช็อตแล้ว ระบบจะปิดและทำลาย GPU อัตโนมัติในอีก <span class="countdown-highlight">{{ formatSeconds(autoStopCountdown) }}</span> นาที เพื่อหยุดคิดเงิน</div>
            </div>
            <button type="button" class="btn btn-sm btn-danger ml-auto" @click="terminateImmediately">
              <Power :size="12" /> ปิดเซิร์ฟเวอร์ทันที
            </button>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="vast-footer">
          <template v-if="step === 1">
            <button type="button" class="btn" @click="handleClose">ยกเลิก</button>
            <button
              type="button"
              class="btn btn-primary-gradient ml-auto"
              :disabled="selectedShots.length === 0 || (accountBalance && !accountBalance.isReserveSufficient)"
              @click="startProvisioning"
            >
              <Sparkles :size="13" />
              ▶ ยืนยันการจอง GPU และเริ่มสร้าง ({{ selectedShots.length }} ช็อต)
            </button>
          </template>

          <template v-else-if="step === 2">
            <button type="button" class="btn btn-danger" @click="stopImmediately">
              <Square :size="13" /> ⏹ ยกเลิก & ปิดเซิร์ฟเวอร์ทันที
            </button>
          </template>

          <template v-else-if="step === 3">
            <button v-if="!isAllDone" type="button" class="btn btn-danger" @click="stopImmediately">
              <Square :size="13" /> ⏹ หยุดการทำงานกลางคัน
            </button>
            <button v-else type="button" class="btn" @click="handleClose">
              ปิดหน้าต่าง
            </button>
            <button
              v-if="isAllDone"
              type="button"
              class="btn btn-primary-gradient ml-auto"
              @click="applyAndGoToMerge"
            >
              <Clapperboard :size="13" />
              🎬 นำวิดีโอทั้งหมดเข้าตอน & ไปหน้ารวมไฟล์ (Export) ➔
            </button>
          </template>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Sparkles, X, Check, Loader2, Clock, Power, Square, Clapperboard, Coins, AlertTriangle, Layers, Cpu, HardDrive, Image, FileText, Sliders, Film, Zap, Volume2 } from 'lucide-vue-next'
import { vastAPI, dramaAPI, episodeAPI } from '~/composables/useApi'
import { toast } from 'vue-sonner'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  storyboards: { type: Array, default: () => [] },
  dramaId: { type: [Number, String], default: 0 },
  episodeId: { type: [Number, String], default: 0 },
})

const emit = defineEmits(['update:isOpen', 'completed'])

const step = ref(1) // 1: Pre-flight, 2: Provisioning Stepper, 3: Batch Rendering

// Model Modes (Cobijada Minimax-H3 vs FastWan 2.2 vs Wan 2.1 vs LTX-2.5)
const selectedModelMode = ref('minimax_h3')
const modelModes = [
  {
    id: 'minimax_h3',
    name: 'Cobijada MiniMax-H3 Hybrid (INT8)',
    tag: 'ภาพยนตร์ + Foley Audio ⭐ แนะนำ',
    description: 'เน้นสีหน้าและอารมณ์มนุษย์สมจริง (สถาปัตยกรรม Hailuo DiT) พร้อมสร้างเสียงเอฟเฟกต์/บรรยากาศ Sync ตรงกับภาพ',
    speedText: '~25-30 วิ/ช็อต',
    stepCount: 25,
    minVram: '24 GB',
    estShotRate: 1.50,
    speedFactor: 5.0,
    badgeClass: 'rec-badge',
    hasAudio: true,
  },
  {
    id: 'fastwan_5b',
    name: 'FastWan 2.2 TI2V (5B FullAttn)',
    tag: 'สปีดเทอร์โบ 3-Step ⚡ ประหยัด 10x',
    description: 'กลั่นกรองโมเดลด้วย DMD รันเพียง 3 สเต็ป จบใน 3-5 วินาทีต่อช็อต ประหยัดค่าเช่า GPU เหมาะสำหรับพรีวิวด่วนหรืองานสปีดจัด',
    speedText: '~3-5 วิ/ช็อต (เร็วสุดขีด)',
    stepCount: 3,
    minVram: '16 GB',
    estShotRate: 0.38,
    speedFactor: 0.55,
    badgeClass: 'speed-badge',
    hasAudio: false,
  },
  {
    id: 'ltx_2_5',
    name: 'Lightricks LTX-2.5 (DiT)',
    tag: 'การ์ด 16GB / เร็ว & คมชัด',
    description: 'โมเดล DiT ยอดฮิตบน Hugging Face รันบนการ์ด 16GB ได้ลื่นไหล ภาพเคลื่อนไหวต่อเนื่องเป็นธรรมชาติ',
    speedText: '~8-12 วิ/ช็อต',
    stepCount: 8,
    minVram: '16 GB',
    estShotRate: 0.65,
    speedFactor: 1.2,
    badgeClass: 'std-badge',
    hasAudio: false,
  },
  {
    id: 'wan2.1_14b',
    name: 'Wan 2.1 14B Image-to-Video',
    tag: 'สตูดิโอมาตรฐาน 720p',
    description: 'โมเดลโอเพนซอร์สยอดนิยม สเกล 14B คมชัด รายละเอียดฉากและแสงเงาสูง 16 FPS',
    speedText: '~45-55 วิ/ช็อต',
    stepCount: 25,
    minVram: '24 GB',
    estShotRate: 1.50,
    speedFactor: 6.0,
    badgeClass: 'std-badge',
    hasAudio: false,
  },
]

const currentModel = computed(() => {
  return modelModes.find(m => m.id === selectedModelMode.value) || modelModes[0]
})

// Account Balance & $20 Reserve & Connection Config
const accountBalance = ref(null)
const vastConnConfig = ref({
  hasApiKey: false,
  maskedApiKey: '',
  hasSshKey: true,
  sshPublicKeyPath: '/Users/noppanan/.ssh/id_ed25519.pub',
})
const apiKeyInput = ref('')
const directSshInput = ref('')
const directComfyInput = ref('')
const savingConnConfig = ref(false)

// GPU Catalogue & TFLOPS
const gpuCatalogue = ref([])
const gpuFilterTier = ref('all')
const selectedGpuId = ref('rtx4090')

// Multi-Episode & Multi-Scene Queue
const episodesList = ref([])
const activeEpisodeTabId = ref(props.episodeId)
const episodeShotsMap = ref({})
const selectedShotIds = ref(new Set())
const inspectedShotId = ref(null)

function toggleInspectShot(id) {
  inspectedShotId.value = inspectedShotId.value === id ? null : id
}

function getShotImage(s) {
  return (
    s?.primary_image_url ||
    s?.first_frame_image ||
    s?.firstFrameImage ||
    s?.composed_image ||
    s?.composedImage ||
    s?.scene_image_url ||
    s?.scene?.image_url ||
    s?.scene?.imageUrl ||
    s?.characters?.[0]?.image_url ||
    s?.characters?.[0]?.imageUrl ||
    s?.image_url ||
    s?.imageUrl ||
    ''
  )
}

// Template selection
const selectedTemplate = ref('wan2.1_comfy_official')
const customTemplateHash = ref('')

// Pricing
const markupPercent = ref(40)
const usdToThbRate = ref(36.0)

// Step 2 & 3 state
const bootSubStep = ref(1)
const bootElapsedSeconds = ref(0)
let bootTimer = null

const renderElapsedSeconds = ref(0)
const autoStopCountdown = ref(180) // 3 minutes grace period
let renderTimer = null
let autoStopTimer = null

const activeShotIndex = ref(0)
const shotStates = ref({})
const isAllDone = ref(false)

const currentSelectedGpu = computed(() => {
  return gpuCatalogue.value.find(g => g.id === selectedGpuId.value) || gpuCatalogue.value[0]
})

const filteredGpuCatalogue = computed(() => {
  if (gpuFilterTier.value === 'all') return gpuCatalogue.value
  return gpuCatalogue.value.filter(g => g.tier === gpuFilterTier.value)
})

const currentTabShots = computed(() => {
  return episodeShotsMap.value[activeEpisodeTabId.value] || props.storyboards || []
})

const allAvailableShots = computed(() => {
  const all = []
  Object.values(episodeShotsMap.value).forEach(list => all.push(...list))
  return all.length ? all : props.storyboards
})

const selectedShots = computed(() => {
  return allAvailableShots.value.filter(s => selectedShotIds.value.has(s.id))
})

const readyKeyframeCount = computed(() => {
  return selectedShots.value.filter(s => !!getShotImage(s)).length
})

const totalQueueDuration = computed(() => {
  return selectedShots.value.reduce((acc, s) => acc + (s.duration || 10), 0)
})

const estimatedBatchStorageGb = computed(() => {
  return (selectedShots.value.length * 15) / 1024
})

const estimatedComputeSeconds = computed(() => {
  const gpu = currentSelectedGpu.value
  const factor = currentModel.value.speedFactor
  const speedMultiplier = (gpu?.tflops || 80) > 80 ? 1.0 : ((gpu?.tflops || 35) > 35 ? 1.6 : 2.2)
  const totalSec = Math.round(totalQueueDuration.value * factor * speedMultiplier)
  return Math.max(selectedShots.value.length * (selectedModelMode.value === 'fastwan_5b' ? 4 : 20), totalSec)
})

const estimatedTimeFormatted = computed(() => {
  const sec = estimatedComputeSeconds.value
  if (sec < 60) return `${sec} วินาที`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m} นาที ${s} วินาที`
})

const estimatedBaseCostThb = computed(() => {
  const gpu = currentSelectedGpu.value
  const hours = estimatedComputeSeconds.value / 3600
  return hours * (gpu?.medianDphUsd || 0.35) * usdToThbRate.value
})

const estimatedMarginThb = computed(() => {
  return estimatedBaseCostThb.value * (markupPercent.value / 100)
})

const currentShotRateThb = computed(() => {
  if (selectedModelMode.value === 'fastwan_5b') {
    return Math.max(0.38, (estimatedBaseCostThb.value + estimatedMarginThb.value) / (selectedShots.value.length || 1))
  }
  return Math.max(1.50, currentSelectedGpu.value?.estPricePerShotThb || 1.50)
})

const currentActualChargeThb = computed(() => {
  const count = Object.values(shotStates.value).filter(s => s.status === 'done').length
  return (count * currentShotRateThb.value).toFixed(2)
})

const completedShotCount = computed(() => {
  return Object.values(shotStates.value).filter(s => s.status === 'done').length
})

const overallProgressPercent = computed(() => {
  if (!selectedShots.value.length) return 0
  return Math.round((completedShotCount.value / selectedShots.value.length) * 100)
})

const stepSubtitle = computed(() => {
  if (step.value === 1) return `ขั้นตอนที่ 1: เลือกโมเดล (${currentModel.value.name}), เลือกช็อต, และเลือกรุ่น GPU`
  if (step.value === 2) return `ขั้นตอนที่ 2: บูตเซิร์ฟเวอร์ GPU On-Demand & โหลดโมเดล ${currentModel.value.name} เข้า VRAM`
  return `ขั้นตอนที่ 3: กำลังประมวลผลคิววิดีโอด้วย ${currentModel.value.name} และสตรีมไฟล์ขึ้น Cloudflare R2`
})

const isBusyBooting = computed(() => step.value === 2)

function isShotSelected(id) {
  return selectedShotIds.value.has(id)
}

function toggleShotSelection(shot) {
  if (selectedShotIds.value.has(shot.id)) {
    selectedShotIds.value.delete(shot.id)
  } else {
    selectedShotIds.value.add(shot.id)
  }
}

function getShotCharNames(shot) {
  if (!shot.characters?.length) return 'ระบุในพรอมต์ฉาก'
  return shot.characters.map(c => c.name || c.char_name).join(', ')
}

function switchEpisodeTab(epId) {
  activeEpisodeTabId.value = epId
}

async function saveVastConnectionConfig() {
  savingConnConfig.value = true
  try {
    const val = directSshInput.value.trim()
    const isHttp = val.startsWith('http://') || val.startsWith('https://')
    const payload = {
      directComfyUrl: isHttp ? val : '',
      directSshCommand: !isHttp ? val : '',
    }
    if (apiKeyInput.value.trim()) {
      payload.apiKey = apiKeyInput.value.trim()
    }
    const res = await vastAPI.saveConfig(payload)
    const data = res?.data || res
    if (data) {
      vastConnConfig.value = data
      if (data.balance) accountBalance.value = data.balance
      apiKeyInput.value = ''
      toast.success('บันทึกการตั้งค่าการเชื่อมต่อ Vast.ai เรียบร้อย')
    }
  } catch (e) {
    toast.error(e.message || 'บันทึกการตั้งค่าไม่สำเร็จ')
  } finally {
    savingConnConfig.value = false
  }
}

async function loadData() {
  try {
    // 0. Fetch Vast Connection Config & SSH Key Status
    const cfgRes = await vastAPI.getConfig()
    const cfgData = cfgRes?.data || cfgRes
    if (cfgData) {
      vastConnConfig.value = cfgData
      directSshInput.value = cfgData.directSshCommand || cfgData.directComfyUrl || ''
      if (cfgData.balance) accountBalance.value = cfgData.balance
    }

    // 1. Fetch Vast Account Balance ($20 Check)
    if (!accountBalance.value) {
      const balRes = await vastAPI.balance()
      accountBalance.value = (balRes && balRes.credit !== undefined) ? balRes : (balRes?.data || null)
    }

    // 2. Fetch GPU Catalogue with TFLOPS
    const gpusRes = await vastAPI.gpus()
    const cat = gpusRes?.catalogue || gpusRes?.data?.catalogue || []
    if (cat.length) {
      gpuCatalogue.value = cat
      const pCfg = gpusRes?.pricingConfig || gpusRes?.data?.pricingConfig
      markupPercent.value = pCfg?.markupPercent || 40
      usdToThbRate.value = pCfg?.usdToThbRate || 36.0
    }

    // 3. Load Current Episode Storyboards from API (with resolved scene & character images)
    activeEpisodeTabId.value = props.episodeId
    try {
      const curSbRes = await episodeAPI.storyboards(props.episodeId)
      const curSbData = Array.isArray(curSbRes) ? curSbRes : (curSbRes?.data || props.storyboards)
      episodeShotsMap.value[props.episodeId] = curSbData
      curSbData.forEach(s => selectedShotIds.value.add(s.id))
    } catch {
      episodeShotsMap.value[props.episodeId] = [...props.storyboards]
      props.storyboards.forEach(s => selectedShotIds.value.add(s.id))
    }

    if (props.dramaId) {
      const dramaRes = await dramaAPI.get(props.dramaId)
      const dramaData = (dramaRes && dramaRes.episodes) ? dramaRes : dramaRes?.data
      if (dramaData?.episodes) {
        episodesList.value = dramaData.episodes
        for (const ep of dramaData.episodes) {
          if (ep.id !== props.episodeId) {
            try {
              const sbRes = await episodeAPI.storyboards(ep.id)
              const sbData = Array.isArray(sbRes) ? sbRes : (sbRes?.data || [])
              episodeShotsMap.value[ep.id] = sbData
              ep.storyboardCount = sbData.length
            } catch (e) {
              console.warn('Failed to load storyboards for ep', ep.id)
            }
          } else {
            ep.storyboardCount = (episodeShotsMap.value[props.episodeId] || props.storyboards).length
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load vast initial data:', err)
  }
}

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    step.value = 1
    isAllDone.value = false
    bootSubStep.value = 1
    bootElapsedSeconds.value = 0
    renderElapsedSeconds.value = 0
    autoStopCountdown.value = 180
    shotStates.value = {}
    selectedShotIds.value.clear()
    loadData()
  } else {
    clearInterval(bootTimer)
    clearInterval(renderTimer)
    clearInterval(autoStopTimer)
  }
})

function getStepClass(stepNum) {
  if (bootSubStep.value > stepNum) return 'done'
  if (bootSubStep.value === stepNum) return 'active'
  return 'pending'
}

const currentJobId = ref(null)
const currentJob = ref(null)
const currentShotIds = ref([])
const lastQueueNotice = ref('')
let pollTimer = null

async function startProvisioning() {
  if (accountBalance.value && accountBalance.value.hasKey && !accountBalance.value.isReserveSufficient) {
    toast.error(`ไม่สามารถจองได้: ยอดเงินในบัญชี Vast.ai ขาดอีก $${accountBalance.value.shortageUsd.toFixed(2)} (ต้องการสำรอง $20.00)`)
    return
  }

  try {
    step.value = 2
    bootSubStep.value = 1
    bootElapsedSeconds.value = 0
    isAllDone.value = false

    const shotIds = selectedShots.value.map(s => s.id)
    if (selectedModelMode.value !== 'minimax_h3') {
      throw new Error('ขณะนี้ Shared Vast รองรับเฉพาะ MiniMax H3')
    }
    const res = await vastAPI.enqueueSharedRender({
      drama_id: props.dramaId,
      episode_id: props.episodeId,
      storyboard_ids: shotIds,
    })

    const job = res?.job || res?.data?.job
    if (!job) {
      throw new Error('ไม่ได้รับข้อมูลงานจากเซิร์ฟเวอร์')
    }

    currentJobId.value = job.id
    currentJob.value = job
    currentShotIds.value = shotIds

    // เริ่มดึงข้อมูลสถานะแบบ Real-time
    startJobPolling(job.id)
  } catch (err) {
    toast.error(err.message || 'เริ่มต้นคิวงานเรนเดอร์ไม่สำเร็จ')
    step.value = 1
  }
}

function startJobPolling(jobId) {
  clearInterval(pollTimer)
  pollTimer = setInterval(async () => {
    try {
      const res = await vastAPI.getSharedRenderJob(jobId)
      const shared = res?.job || res?.data?.job || res
      const job = shared?.runner_job || shared?.runnerJob || shared
      if (!job) return

      currentJob.value = { ...job, sharedStatus: shared.status, queuePosition: shared.queue_position, poolStatus: shared.pool_status }
      step.value = shared.status === 'queued' ? 1 : (job.stepNumber || 2)
      bootSubStep.value = job.bootSubStep || 1
      bootElapsedSeconds.value = job.bootElapsedSeconds || 0
      renderElapsedSeconds.value = job.renderElapsedSeconds || 0
      autoStopCountdown.value = job.autoStopCountdown !== undefined ? job.autoStopCountdown : 180
      activeShotIndex.value = job.activeShotIndex || 0

      if (shared.status === 'queued') {
        const notice = `${shared.status}:${shared.queue_position || 0}`
        if (lastQueueNotice.value !== notice) {
          lastQueueNotice.value = notice
          toast.info(`เข้าคิว Shared MiniMax H3 แล้ว${shared.queue_position ? ` — ลำดับที่ ${shared.queue_position}` : ''}`, { timeout: 2500 })
        }
      } else if (shared.status === 'starting') {
        step.value = 2
      }

      // อัปเดตสถานะช็อตในตารางจากหลังบ้าน
      if (job.shots && Array.isArray(job.shots)) {
        job.shots.forEach(s => {
          shotStates.value[s.storyboardId] = {
            status: s.status,
            step: s.step || 1,
            totalSteps: s.totalSteps || (selectedModelMode.value === 'fastwan_5b' ? 3 : 25),
            duration: s.duration,
            videoUrl: s.videoUrl,
            fileSizeMb: s.fileSizeMb,
          }
        })
      }

      if (['completed', 'failed', 'cancelled'].includes(shared.status)) {
        isAllDone.value = true
        clearInterval(pollTimer)
        if (shared.status === 'completed') {
          toast.success(`เรนเดอร์ครบทุกช็อตแล้ว (${job.completedShots || 0}/${job.totalShots || currentShotIds.value.length})!`)
        } else if (shared.status === 'failed') {
          toast.error(shared.errorMsg || job.error || 'การเรนเดอร์ล้มเหลว')
        }
      }
    } catch (e) {
      console.warn('Poll job error:', e)
    }
  }, 1000)
}

async function stopImmediately() {
  clearInterval(pollTimer)
  clearInterval(bootTimer)
  clearInterval(renderTimer)
  clearInterval(autoStopTimer)

  if (currentJobId.value) {
    try {
      await vastAPI.cancelSharedRender(currentJobId.value)
    } catch (e) {
      console.warn('Cancel job error:', e)
    }
  }

  toast.warning('ยกเลิกงานแล้ว ระบบจะคืนเครดิตที่สำรองไว้และเก็บ Shared GPU ตาม idle policy')
  handleClose()
}

async function terminateImmediately() {
  clearInterval(pollTimer)
  clearInterval(autoStopTimer)

  if (currentJobId.value) {
    try {
      await vastAPI.cancelSharedRender(currentJobId.value)
    } catch (e) {
      console.warn('Terminate job error:', e)
    }
  }

  toast.success('ปิดเซิร์ฟเวอร์ GPU สำเร็จ และบันทึกยอดเงินเรียบร้อย')
  handleClose()
}

function applyAndGoToMerge() {
  clearInterval(pollTimer)
  clearInterval(autoStopTimer)
  const completedList = selectedShots.value.map(s => ({
    storyboardId: s.id,
    videoUrl: shotStates.value[s.id]?.videoUrl || s.video_url || s.videoUrl,
  }))
  toast.success(`นำวิดีโอเข้าโปรเจกต์ครบทั้ง ${completedList.length} ช็อตแล้ว!`)
  emit('completed', completedList)
  handleClose()
}

function handleClose() {
  clearInterval(pollTimer)
  clearInterval(bootTimer)
  clearInterval(renderTimer)
  clearInterval(autoStopTimer)
  emit('update:isOpen', false)
}

function formatSeconds(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

onUnmounted(() => {
  clearInterval(bootTimer)
  clearInterval(renderTimer)
  clearInterval(autoStopTimer)
})
</script>

<style scoped>
.vast-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.vast-dialog {
  background: var(--bg-card, #18181b);
  border: 1px solid var(--border, #27272a);
  border-radius: 14px;
  width: 100%;
  max-width: 880px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text, #f4f4f5);
}

.vast-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border, #27272a);
  background: rgba(24, 24, 27, 0.7);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.icon-badge {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: rgba(139, 92, 246, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.modal-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}

.badge-tag {
  background: rgba(139, 92, 246, 0.2);
  color: #c084fc;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.balance-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}
.balance-tag.is-ok {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.balance-tag.is-warn {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.modal-subtitle {
  margin: 3px 0 0 0;
  font-size: 12px;
  color: var(--text-muted, #a1a1aa);
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
}
.close-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.vast-body {
  padding: 18px 22px;
  overflow-y: auto;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* Reserve Warning Banner */
.reserve-warn-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 8px;
  padding: 10px 14px;
  font-size: 12px;
  color: #fca5a5;
  line-height: 1.4;
}

/* Section Card */
.section-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border, #27272a);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
}

.section-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text, #f4f4f5);
}

.queue-summary-tags {
  display: flex;
  gap: 6px;
}

.tag-pill {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-muted, #a1a1aa);
}
.tag-pill.ok {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.tag-pill.warn {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.episode-pill-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.episode-pill-label {
  font-size: 11px;
  color: var(--text-muted, #71717a);
  flex-shrink: 0;
}

.ep-tab-btn {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border, #3f3f46);
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
}
.ep-tab-btn.active {
  background: #8b5cf6;
  border-color: #8b5cf6;
  color: #fff;
  font-weight: 600;
}

.queue-shot-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 6px;
}

.queue-shot-item {
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  transition: all 0.15s;
  overflow: hidden;
}
.queue-shot-item:hover {
  background: rgba(255, 255, 255, 0.035);
  border-color: rgba(255, 255, 255, 0.1);
}
.queue-shot-item.is-selected {
  border-color: rgba(139, 92, 246, 0.45);
  background: rgba(139, 92, 246, 0.05);
}
.queue-shot-item.is-inspected {
  border-color: rgba(168, 85, 247, 0.6);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
}

.shot-row-main {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  cursor: pointer;
  width: 100%;
}

.shot-actions-col {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.btn-inspect-shot {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted, #a1a1aa);
  padding: 4px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn-inspect-shot:hover {
  background: rgba(139, 92, 246, 0.15);
  border-color: rgba(139, 92, 246, 0.35);
  color: #c084fc;
}
.btn-inspect-shot.active {
  background: rgba(139, 92, 246, 0.25);
  border-color: rgba(139, 92, 246, 0.6);
  color: #fff;
  font-weight: 600;
}

/* Expanded Inspector Drawer */
.shot-inspector-drawer {
  background: rgba(15, 15, 20, 0.75);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 14px;
}

.inspector-grid {
  display: grid;
  grid-template-columns: 1fr 1.2fr;
  gap: 12px;
}

.inspector-card {
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.inspector-card-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #e4e4e7;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 6px;
}

.fidelity-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 11px;
}

.fidelity-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.f-label {
  color: var(--text-muted, #71717a);
  font-size: 10px;
}

.f-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10.5px;
  font-weight: 600;
  width: fit-content;
}
.f-badge.ok {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.f-badge.warn {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
}

.f-chars-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.f-char-tag {
  background: rgba(139, 92, 246, 0.15);
  color: #c084fc;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
}

.f-text {
  color: #d4d4d8;
  font-size: 11px;
}

.duration-tune-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: rgba(0, 0, 0, 0.2);
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.04);
}

.dur-tune-label {
  font-size: 11px;
  color: #a1a1aa;
}

.dur-tune-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dur-tune-input {
  width: 52px;
  padding: 2px 6px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  border-radius: 4px;
  font-size: 11px;
  text-align: center;
  font-family: monospace;
}

.dur-tune-unit {
  font-size: 11px;
  color: #71717a;
}

.dur-tune-frames {
  font-size: 10.5px;
  color: #a855f7;
  font-weight: 600;
  font-family: monospace;
}

.prompt-tune-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.prompt-tune-label {
  font-size: 10.5px;
  color: #a1a1aa;
}

.prompt-tune-textarea {
  width: 100%;
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e4e4e7;
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
  font-family: inherit;
  resize: vertical;
  line-height: 1.4;
}
.prompt-tune-textarea:focus {
  outline: none;
  border-color: rgba(139, 92, 246, 0.6);
  background: rgba(0, 0, 0, 0.5);
}

.shot-thumb-box {
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 4px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}

.shot-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.shot-img-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #52525b;
}

.shot-seq {
  position: absolute;
  bottom: 1px;
  left: 1px;
  background: rgba(0, 0, 0, 0.8);
  font-size: 9px;
  padding: 1px 3px;
  border-radius: 2px;
  font-weight: 700;
}

.shot-meta-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.shot-title-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.dur-badge {
  font-size: 10px;
  padding: 0 4px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
}

.status-tag {
  font-size: 10px;
  padding: 0 5px;
  border-radius: 3px;
}
.status-tag.ok {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.status-tag.warn {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}

.shot-desc-truncate {
  font-size: 11px;
  color: var(--text-muted, #71717a);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shot-ref-line {
  font-size: 10px;
  color: var(--text-muted, #a1a1aa);
}
.ref-chars {
  color: #c084fc;
}

/* Tier Filters */
.tier-filter-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-chip {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border, #3f3f46);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
  cursor: pointer;
}
.filter-chip.active {
  background: #8b5cf6;
  border-color: #8b5cf6;
  color: #fff;
  font-weight: 600;
}

.badge-tag.audio-badge {
  background: rgba(16, 185, 129, 0.18);
  color: #34d399;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Model Architecture Mode Grid */
.model-mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.model-mode-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border, #27272a);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 6px;
  transition: all 0.15s ease;
}
.model-mode-card:hover {
  border-color: rgba(139, 92, 246, 0.45);
  background: rgba(255, 255, 255, 0.04);
}
.model-mode-card.is-active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.09);
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.15);
}
.model-mode-card.is-rec {
  border-left: 3px solid #8b5cf6;
}

.model-mode-top {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.model-mode-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
}

.model-mode-name {
  font-size: 12px;
  font-weight: 700;
  color: #f4f4f5;
  line-height: 1.3;
}

.model-mode-badge {
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 600;
  white-space: nowrap;
}
.model-mode-badge.rec-badge {
  background: rgba(139, 92, 246, 0.25);
  color: #c084fc;
}
.model-mode-badge.speed-badge {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
}
.model-mode-badge.std-badge {
  background: rgba(255, 255, 255, 0.08);
  color: #a1a1aa;
}

.model-mode-meta-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.meta-tag {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 9.5px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
  color: #a1a1aa;
}
.meta-tag.audio {
  background: rgba(16, 185, 129, 0.15);
  color: #34d399;
}
.meta-tag.speed {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
}
.meta-tag.vram {
  font-family: monospace;
}

.model-mode-desc {
  font-size: 10.5px;
  color: var(--text-muted, #a1a1aa);
  line-height: 1.35;
  margin: 0;
  flex: 1;
}

.model-mode-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 6px;
  margin-top: 4px;
}

.model-rate-hint {
  font-size: 10.5px;
  color: #d4d4d8;
}
.model-rate-hint strong {
  color: #a855f7;
}

.mode-select-pill {
  font-size: 10px;
  padding: 1px 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #e4e4e7;
  font-weight: 600;
}
.model-mode-card.is-active .mode-select-pill {
  background: #8b5cf6;
  color: #fff;
}

/* GPU Grid */
.gpu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 10px;
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.gpu-select-card {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border, #27272a);
  border-radius: 8px;
  padding: 10px 12px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s ease;
}
.gpu-select-card:hover {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.03);
}
.gpu-select-card.is-active {
  border-color: #8b5cf6;
  background: rgba(139, 92, 246, 0.08);
}
.gpu-select-card.is-rec {
  border-left: 3px solid #8b5cf6;
}

.gpu-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.gpu-name-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gpu-name {
  font-size: 12px;
  font-weight: 700;
}

.rec-badge {
  font-size: 9px;
  background: rgba(139, 92, 246, 0.25);
  color: #c084fc;
  padding: 1px 5px;
  border-radius: 4px;
  font-weight: 700;
}

.gpu-vram-tag {
  font-size: 11px;
  font-weight: 600;
  color: #c084fc;
}

.gpu-specs-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
}

.spec-col {
  display: flex;
  gap: 4px;
}
.spec-label {
  color: var(--text-muted, #71717a);
}
.spec-val {
  font-weight: 600;
}

.gpu-desc-text {
  font-size: 10px;
  color: var(--text-muted, #71717a);
}

.gpu-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: 6px;
  margin-top: 2px;
}

.gpu-price-info {
  display: flex;
  flex-direction: column;
}
.dph-thb {
  font-size: 12px;
  font-weight: 700;
  color: var(--text, #f4f4f5);
}
.shot-rate {
  font-size: 10px;
  color: var(--text-muted, #a1a1aa);
}

.select-indicator {
  font-size: 10px;
  color: #8b5cf6;
  font-weight: 600;
}

/* Config Grid */
.config-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.config-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
}

.select-input, .input-custom {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border, #3f3f46);
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  padding: 6px 10px;
}

.r2-gauge-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.gauge-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
}

.gauge-bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.gauge-fill {
  height: 100%;
  background: #10b981;
}

/* Pricing Box */
.pricing-box {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border, #27272a);
  border-radius: 10px;
  padding: 14px 18px;
}

.pricing-box-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.pricing-box-title {
  font-size: 13px;
  font-weight: 700;
}

.markup-tag {
  font-size: 11px;
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
}

.pricing-lines {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pricing-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-muted, #a1a1aa);
}

.pricing-divider {
  height: 1px;
  background: var(--border, #27272a);
  margin: 4px 0;
}

.pricing-line.total {
  font-size: 13px;
  color: var(--text, #f4f4f5);
}

.total-amount {
  font-size: 18px;
  font-weight: 800;
  color: #c084fc;
}

/* Stepper styles */
.stepper-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0;
  text-align: center;
}

.stepper-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
}

.stepper-desc {
  font-size: 12px;
  color: var(--text-muted, #a1a1aa);
  max-width: 540px;
  margin-bottom: 24px;
}

.stepper-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 560px;
  text-align: left;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 14px;
}

.step-circle {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border, #3f3f46);
  color: var(--text-muted, #71717a);
  flex-shrink: 0;
}

.step-item.active .step-circle {
  border-color: #8b5cf6;
  color: #c084fc;
  background: rgba(139, 92, 246, 0.15);
}

.step-item.done .step-circle {
  background: #10b981;
  border-color: #10b981;
  color: #fff;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-name {
  font-size: 13px;
  font-weight: 600;
}

.step-sub {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
}

.boot-time-counter {
  margin-top: 24px;
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: var(--text-muted, #a1a1aa);
}

.ssh-banner-box {
  margin-top: 14px;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(139, 92, 246, 0.35);
  border-radius: 6px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.ssh-label {
  color: #c084fc;
  font-weight: 600;
  white-space: nowrap;
}
.ssh-code {
  color: #38bdf8;
  font-family: monospace;
  font-size: 11px;
  overflow-x: auto;
  user-select: all;
}

.stepper-log-scroll {
  margin-top: 10px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.log-item-line {
  font-family: monospace;
  font-size: 10.5px;
  color: #a1a1aa;
}

/* Render console */
.render-header-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border, #27272a);
  border-radius: 10px;
  padding: 12px 14px;
}

.render-stat-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-muted, #a1a1aa);
}

.stat-val {
  font-size: 13px;
  font-weight: 700;
}

.progress-bar-container {
  margin-top: 4px;
}

.progress-bar-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-bottom: 6px;
}

.progress-bar-track {
  height: 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #8b5cf6, #ec4899);
  transition: width 0.3s ease;
}

.render-shots-table {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.render-shot-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border, #27272a);
  border-radius: 8px;
}

.render-shot-row.is-rendering {
  border-color: rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.05);
}

.render-shot-row.is-done {
  border-color: rgba(16, 185, 129, 0.3);
}

.shot-thumb-col {
  position: relative;
  width: 44px;
  height: 44px;
  border-radius: 6px;
  overflow: hidden;
  background: #000;
  flex-shrink: 0;
}

.shot-idx {
  position: absolute;
  bottom: 2px;
  left: 2px;
  background: rgba(0, 0, 0, 0.7);
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 700;
}

.shot-detail-col {
  flex: 1;
  min-width: 0;
}

.shot-name-line {
  font-size: 12px;
  margin-bottom: 2px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.shot-desc-line {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

.shot-status-col {
  flex-shrink: 0;
}

.tag-done {
  font-size: 11px;
  color: #34d399;
  font-weight: 600;
}

.tag-rendering {
  font-size: 11px;
  color: #c084fc;
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 600;
}

.tag-queued {
  font-size: 11px;
  color: var(--text-muted, #71717a);
}

.autostop-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(16, 185, 129, 0.08);
  border: 1px solid rgba(16, 185, 129, 0.25);
  border-radius: 10px;
  padding: 12px 16px;
}

.autostop-icon {
  color: #34d399;
}

.autostop-info {
  font-size: 12px;
  line-height: 1.4;
}

.countdown-highlight {
  color: #34d399;
  font-weight: 700;
  font-family: monospace;
}

.vast-footer {
  display: flex;
  align-items: center;
  padding: 14px 22px;
  border-top: 1px solid var(--border, #27272a);
  background: rgba(24, 24, 27, 0.7);
}

.btn-primary-gradient {
  background: linear-gradient(135deg, #8b5cf6, #ec4899);
  color: #fff;
  border: none;
  font-weight: 600;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.25);
}
.btn-primary-gradient:hover:not(:disabled) {
  filter: brightness(1.1);
}
.btn-primary-gradient:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-danger {
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}
.btn-danger:hover {
  background: rgba(239, 68, 68, 0.25);
}
</style>
