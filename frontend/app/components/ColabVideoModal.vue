<template>
  <Teleport to="body">
    <div v-if="isOpen" class="colab-overlay" @click.self="closeModal">
      <div class="colab-dialog" role="dialog" aria-modal="true">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-left">
            <div class="icon-badge">
              <Sparkles :size="20" class="text-amber-400" />
            </div>
            <div>
              <h2 class="modal-title">Colab / Kaggle AI Video Studio</h2>
              <p class="modal-subtitle">
                {{ step === 1 ? 'ขั้นตอนที่ 1: สร้างและตรวจทาน Screenshot Keyframe' : 'ขั้นตอนที่ 2: เรนเดอร์วิดีโอผ่าน Colab GPU & Cloudflare R2' }}
              </p>
            </div>
          </div>
          <button type="button" class="close-btn" @click="closeModal">
            <X :size="18" />
          </button>
        </div>

        <!-- Body Step 1: Screenshot Generation -->
        <div v-if="step === 1" class="modal-body">
          <div class="form-section">
            <label class="form-label">คำบรรยายฉาก (Prompt):</label>
            <textarea
              v-model="promptInput"
              class="form-textarea"
              rows="3"
              placeholder="ระบุฉากและการกระทำ เช่น ชายหนุ่มถือดาบในป่าไผ่ แสงอาทิตย์ส่องย้อนแสง..."
            />
          </div>

          <div class="form-section">
            <label class="form-label">ตัวละครอ้างอิง (Character Reference):</label>
            <div class="character-selector">
              <div
                v-for="char in characters"
                :key="char.id"
                class="character-card"
                :class="{ active: selectedCharacterId === char.id }"
                @click="selectCharacter(char)"
              >
                <img
                  v-if="char.image_url || char.imageUrl"
                  :src="char.image_url || char.imageUrl"
                  class="character-avatar"
                />
                <div v-else class="character-placeholder">
                  {{ char.name?.[0] || '?' }}
                </div>
                <span class="character-name">{{ char.name }}</span>
              </div>

              <div
                v-if="!characters?.length"
                class="no-chars-tip"
              >
                ไม่พบรายการตัวละครในเรื่อง สามารถพิมพ์ Prompt ได้โดยตรง
              </div>
            </div>
          </div>

          <!-- Preview & Action -->
          <div v-if="screenshotPreviewUrl" class="screenshot-preview-box">
            <div class="preview-header">
              <span class="preview-badge">Screenshot ที่สร้างเสร็จแล้ว</span>
              <button
                type="button"
                class="btn-text"
                :disabled="isGeneratingScreenshot"
                @click="generateScreenshot"
              >
                <RotateCw :size="14" :class="{ 'animate-spin': isGeneratingScreenshot }" />
                สร้างใหม่
              </button>
            </div>
            <div class="image-wrapper">
              <img :src="screenshotPreviewUrl" class="screenshot-img" alt="Screenshot Keyframe" />
            </div>
          </div>

          <div v-if="screenshotError" class="error-banner">
            <AlertCircle :size="16" />
            <span>{{ screenshotError }}</span>
          </div>
        </div>

        <!-- Body Step 2: Colab Render Video -->
        <div v-if="step === 2" class="modal-body">
          <div class="step2-grid">
            <div class="keyframe-card">
              <span class="section-tag">First Frame (คีย์เฟรมเริ่มต้น)</span>
              <img :src="screenshotPreviewUrl" class="keyframe-thumb" />
            </div>

            <div class="render-settings">
              <div class="form-section">
                <label class="form-label">Motion Prompt (คำสั่งเคลื่อนไหว):</label>
                <textarea
                  v-model="motionPromptInput"
                  class="form-textarea"
                  rows="2"
                  placeholder="เช่น กล้องซูมเข้าช้าๆ, ตัวละครขยับดาบอย่างสง่างาม, ลมพัดเสื้อคลุม"
                />
              </div>

              <div class="settings-row">
                <div class="setting-item">
                  <label class="form-label">โมเดล:</label>
                  <select v-model="selectedModel" class="form-select">
                    <option value="wan2.1-i2v">Wan 2.1 Image-to-Video (แนะนำ)</option>
                    <option value="ali-vilab/text-to-video-ms-1.7b">ModelScope 1.7B (รุ่นทดสอบ)</option>
                  </select>
                </div>
                <div class="setting-item">
                  <label class="form-label">ความยาว:</label>
                  <select v-model="durationSec" class="form-select">
                    <option :value="5">5 วินาที</option>
                    <option :value="10">10 วินาที</option>
                  </select>
                </div>
              </div>

              <div class="r2-badge-notice">
                <Cloud :size="14" class="text-blue-400" />
                <span>บันทึกผลงานลง <strong>Cloudflare R2 (Bucket: vdo)</strong> อัตโนมัติ</span>
              </div>
            </div>
          </div>

          <!-- Video Job Status & Live Preview -->
          <div v-if="activeJobId" class="job-status-card">
            <div class="status-indicator">
              <Loader2 v-if="jobStatus === 'queued' || jobStatus === 'processing'" :size="18" class="animate-spin text-amber-400" />
              <CheckCircle2 v-else-if="jobStatus === 'completed'" :size="18" class="text-emerald-400" />
              <AlertTriangle v-else :size="18" class="text-red-400" />
              <span class="status-text">{{ jobStatusText }}</span>
            </div>

            <!-- Video Player when completed -->
            <div v-if="completedVideoUrl" class="completed-video-box">
              <video
                :src="completedVideoUrl"
                controls
                autoplay
                loop
                class="rendered-video-player"
              />
            </div>

            <div class="notebook-action-row">
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                @click="downloadNotebook"
              >
                <Download :size="14" />
                ดาวน์โหลด 1-Click Colab Notebook
              </button>
              <a
                href="https://colab.research.google.com"
                target="_blank"
                rel="noreferrer"
                class="btn btn-secondary btn-sm link-btn"
              >
                <ExternalLink :size="14" />
                เปิด Google Colab
              </a>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="closeModal">
            ปิด
          </button>

          <!-- Step 1 Actions -->
          <template v-if="step === 1">
            <button
              v-if="!screenshotPreviewUrl"
              type="button"
              class="btn btn-primary"
              :disabled="isGeneratingScreenshot || !promptInput"
              @click="generateScreenshot"
            >
              <Sparkles :size="16" />
              {{ isGeneratingScreenshot ? 'กำลังสร้าง Screenshot...' : '⚡ สร้าง Screenshot (Keyframe)' }}
            </button>
            <button
              v-else
              type="button"
              class="btn btn-primary"
              @click="approveScreenshotAndNext"
            >
              ใช้นี้เป็นคีย์เฟรมและไปต่อ &rarr;
            </button>
          </template>

          <!-- Step 2 Actions -->
          <template v-if="step === 2">
            <button
              type="button"
              class="btn btn-secondary"
              @click="step = 1"
            >
              &larr; ย้อนกลับไปปรับคีย์เฟรม
            </button>
            <button
              v-if="!activeJobId || jobStatus === 'failed'"
              type="button"
              class="btn btn-primary"
              :disabled="isSubmittingJob"
              @click="submitColabRender"
            >
              <Play :size="16" />
              {{ isSubmittingJob ? 'กำลังส่งงาน...' : '🚀 สั่งเรนเดอร์วิดีโอ (Colab Worker)' }}
            </button>
            <button
              v-else-if="jobStatus === 'completed'"
              type="button"
              class="btn btn-success"
              @click="applyAndClose"
            >
              <Check :size="16" />
              บันทึกลง Shot นี้เรียบร้อย
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Sparkles,
  X,
  RotateCw,
  AlertCircle,
  Cloud,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Download,
  ExternalLink,
  Play,
  Check,
} from 'lucide-vue-next'
import { api } from '~/composables/useApi'

interface Props {
  isOpen: boolean
  storyboard: any
  dramaId: number
  characters?: any[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:isOpen', value: boolean): void
  (e: 'completed', videoUrl: string): void
}>()

const step = ref<1 | 2>(1)
const promptInput = ref('')
const motionPromptInput = ref('')
const selectedCharacterId = ref<number | null>(null)
const selectedCharacterRefUrl = ref('')
const isGeneratingScreenshot = ref(false)
const screenshotPreviewUrl = ref('')
const screenshotError = ref('')

const selectedModel = ref('wan2.1-i2v')
const durationSec = ref(5)

const isSubmittingJob = ref(false)
const activeJobId = ref<number | null>(null)
const jobStatus = ref<'queued' | 'processing' | 'completed' | 'failed' | ''>('')
const completedVideoUrl = ref('')

// Initialize inputs when modal opens
watch(
  () => props.isOpen,
  (open) => {
    if (open && props.storyboard) {
      step.value = 1
      promptInput.value =
        props.storyboard.description ||
        props.storyboard.video_prompt ||
        props.storyboard.image_prompt ||
        ''
      motionPromptInput.value = promptInput.value
      screenshotPreviewUrl.value =
        props.storyboard.composed_image ||
        props.storyboard.first_frame_image ||
        props.storyboard.image_url ||
        ''
      selectedCharacterId.value = null
      selectedCharacterRefUrl.value = ''
      activeJobId.value = null
      jobStatus.value = ''
      completedVideoUrl.value = ''
      screenshotError.value = ''

      // Auto-select character if linked
      if (props.characters?.length) {
        selectCharacter(props.characters[0])
      }
    }
  },
  { immediate: true },
)

function selectCharacter(char: any) {
  selectedCharacterId.value = char.id
  selectedCharacterRefUrl.value = char.image_url || char.imageUrl || ''
}

function closeModal() {
  emit('update:isOpen', false)
}

async function generateScreenshot() {
  isGeneratingScreenshot.value = true
  screenshotError.value = ''

  try {
    const res: any = await api.post('/worker/screenshot', {
      drama_id: props.dramaId,
      storyboard_id: props.storyboard?.id,
      prompt: promptInput.value,
      character_id: selectedCharacterId.value,
      character_reference_url: selectedCharacterRefUrl.value,
    })

    if (res.screenshot_url) {
      screenshotPreviewUrl.value = res.screenshot_url
    } else if (res.reference_images?.[0]) {
      screenshotPreviewUrl.value = res.reference_images[0]
    } else if (selectedCharacterRefUrl.value) {
      screenshotPreviewUrl.value = selectedCharacterRefUrl.value
    } else {
      screenshotPreviewUrl.value = '/storyvdo/static/placeholder.jpg'
    }
  } catch (err: any) {
    if (selectedCharacterRefUrl.value) {
      screenshotPreviewUrl.value = selectedCharacterRefUrl.value
    } else {
      screenshotError.value = err?.message || 'ไม่สามารถสร้าง Screenshot ได้'
    }
  } finally {
    isGeneratingScreenshot.value = false
  }
}

function approveScreenshotAndNext() {
  if (!screenshotPreviewUrl.value) return
  step.value = 2
}

async function submitColabRender() {
  if (!props.storyboard?.id) return
  isSubmittingJob.value = true
  completedVideoUrl.value = ''

  try {
    const res: any = await api.post('/worker/jobs', {
      storyboard_id: props.storyboard.id,
      drama_id: props.dramaId,
      prompt: motionPromptInput.value || promptInput.value,
      screenshot_url: screenshotPreviewUrl.value,
      duration: durationSec.value,
      model: selectedModel.value,
    })

    activeJobId.value = res.task_id
    jobStatus.value = 'queued'
    startPollingJob(res.task_id)
  } catch (err: any) {
    jobStatus.value = 'failed'
    alert(`เกิดข้อผิดพลาดในการส่งงาน: ${err?.message || err}`)
  } finally {
    isSubmittingJob.value = false
  }
}

let pollInterval: any = null
function startPollingJob(taskId: number) {
  if (pollInterval) clearInterval(pollInterval)

  pollInterval = setInterval(async () => {
    try {
      const res: any = await api.get(`/worker/jobs/${taskId}/status`)
      jobStatus.value = res.status
      if (res.status === 'completed' && res.video_url) {
        completedVideoUrl.value = res.video_url
        clearInterval(pollInterval)
        emit('completed', res.video_url)
      } else if (res.status === 'failed') {
        clearInterval(pollInterval)
      }
    } catch {
      // transient network poll failure
    }
  }, 4000)
}

function downloadNotebook() {
  if (!activeJobId.value) return
  window.open(`/api/v1/worker/jobs/${activeJobId.value}/notebook`, '_blank')
}

function applyAndClose() {
  if (completedVideoUrl.value) {
    emit('completed', completedVideoUrl.value)
  }
  closeModal()
}

const jobStatusText = computed(() => {
  switch (jobStatus.value) {
    case 'queued':
      return 'กำลังรอ Colab GPU Worker มารับงาน (Worker เปิดทิ้งไว้จะดึงไปทำทันที)...'
    case 'processing':
      return 'Worker กำลังประมวลผล Image-to-Video บน GPU และอัปโหลดไปยัง Cloudflare R2...'
    case 'completed':
      return 'เรนเดอร์และอัปโหลดไปยัง Cloudflare R2 สำเร็จเรียบร้อย!'
    case 'failed':
      return 'การเรนเดอร์ล้มเหลว กรุณาตรวจสอบ Colab Worker หรือลองใหม่อีกครั้ง'
    default:
      return 'เตรียมพร้อมส่งงาน'
  }
})
</script>

<style scoped>
.colab-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.75);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.colab-dialog {
  background-color: #18181b;
  border: 1px solid #27272a;
  border-radius: 1rem;
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  color: #f4f4f5;
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #27272a;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 0.875rem;
}

.icon-badge {
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.625rem;
  background: rgba(245, 158, 11, 0.15);
  border: 1px solid rgba(245, 158, 11, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #fafafa;
}

.modal-subtitle {
  font-size: 0.8125rem;
  color: #a1a1aa;
}

.close-btn {
  background: transparent;
  border: none;
  color: #a1a1aa;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.375rem;
  transition: all 0.15s;
}

.close-btn:hover {
  background: #27272a;
  color: #fafafa;
}

.modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #d4d4d8;
}

.form-textarea {
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 0.5rem;
  padding: 0.625rem 0.875rem;
  color: #f4f4f5;
  font-size: 0.875rem;
  resize: vertical;
  outline: none;
}

.form-textarea:focus {
  border-color: #f59e0b;
}

.character-selector {
  display: flex;
  gap: 0.625rem;
  overflow-x: auto;
  padding-bottom: 0.375rem;
}

.character-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
  min-width: 80px;
}

.character-card:hover {
  border-color: #52525b;
}

.character-card.active {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}

.character-avatar {
  width: 44px;
  height: 44px;
  border-radius: 0.375rem;
  object-fit: cover;
}

.character-placeholder {
  width: 44px;
  height: 44px;
  border-radius: 0.375rem;
  background: #27272a;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  color: #a1a1aa;
}

.character-name {
  font-size: 0.75rem;
  color: #e4e4e7;
  max-width: 70px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-chars-tip {
  font-size: 0.8125rem;
  color: #71717a;
  padding: 0.5rem 0;
}

.screenshot-preview-box {
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 0.625rem;
  padding: 0.875rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.preview-badge {
  font-size: 0.75rem;
  color: #a1a1aa;
  font-weight: 500;
}

.btn-text {
  background: transparent;
  border: none;
  color: #f59e0b;
  font-size: 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.image-wrapper {
  max-height: 240px;
  border-radius: 0.375rem;
  overflow: hidden;
  background: #000;
  display: flex;
  justify-content: center;
}

.screenshot-img {
  max-height: 240px;
  object-fit: contain;
}

.step2-grid {
  display: grid;
  grid-template-columns: 180px 1fr;
  gap: 1.125rem;
}

.keyframe-card {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.section-tag {
  font-size: 0.6875rem;
  color: #a1a1aa;
  text-transform: uppercase;
  font-weight: 600;
}

.keyframe-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  border-radius: 0.5rem;
  border: 1px solid #27272a;
}

.render-settings {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.settings-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.form-select {
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 0.375rem;
  padding: 0.5rem 0.625rem;
  color: #f4f4f5;
  font-size: 0.8125rem;
  outline: none;
}

.r2-badge-notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 0.375rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.75rem;
  color: #93c5fd;
}

.job-status-card {
  background: #09090b;
  border: 1px solid #27272a;
  border-radius: 0.625rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.status-text {
  font-size: 0.8125rem;
  font-weight: 500;
}

.completed-video-box {
  border-radius: 0.5rem;
  overflow: hidden;
  background: #000;
}

.rendered-video-player {
  width: 100%;
  max-height: 260px;
}

.notebook-action-row {
  display: flex;
  gap: 0.625rem;
  flex-wrap: wrap;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 0.375rem;
  padding: 0.625rem 0.875rem;
  color: #fca5a5;
  font-size: 0.8125rem;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #27272a;
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  background: #141416;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.btn-primary {
  background: #f59e0b;
  color: #18181b;
}

.btn-primary:hover {
  background: #d97706;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: #27272a;
  color: #e4e4e7;
  border-color: #3f3f46;
}

.btn-secondary:hover {
  background: #3f3f46;
}

.btn-success {
  background: #10b981;
  color: #fff;
}

.btn-success:hover {
  background: #059669;
}

.btn-sm {
  font-size: 0.75rem;
  padding: 0.375rem 0.75rem;
}

.link-btn {
  text-decoration: none;
}
</style>
