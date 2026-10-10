<template>
  <div class="page story-mode-page">
    <!-- Drama Loading State -->
    <div v-if="loadingDrama" class="card state-box" role="status" aria-live="polite">
      <div class="spinner"></div>
      <p>{{ t('story.loading') }}</p>
    </div>

    <!-- Drama Load Error State -->
    <div v-else-if="loadError" class="card state-box error-box" role="alert">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p class="error-msg">{{ loadError }}</p>
      <button class="btn btn-primary" @click="loadData">{{ t('story.retry') }}</button>
    </div>

    <!-- Main Content -->
    <div v-else-if="drama" class="story-content">
      <!-- Header -->
      <div class="page-head card">
        <button
          class="back-btn"
          :title="t('story.back')"
          :aria-label="t('story.back')"
          @click="navigateTo(`/drama/${drama.id}`)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
          </svg>
        </button>
        <div class="head-info">
          <div class="head-title-row">
            <h1 class="page-title">{{ drama.title }}</h1>
            <span class="tag tag-accent">{{ t('story.title') }}</span>
          </div>
          <p class="head-sub">
            {{ t('story.stats', { total: readiness.total, prompts: readiness.withPrompt, images: readiness.withImage, videos: readiness.withVideo, percent: readiness.percent }) }}
          </p>
        </div>
        <div class="head-actions">
          <button
            class="btn btn-secondary pending-ai-btn"
            disabled
            :title="t('story.aiActionsDisabled')"
            :aria-label="t('story.aiActionsDisabled')"
            aria-disabled="true"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
            </svg>
            <span>{{ t('story.aiPlanBtn') }}</span>
          </button>
        </div>
      </div>

      <!-- Story Brief Section (Read-only workspace) -->
      <div class="card brief-card">
        <div class="card-head">
          <h2 class="section-title">{{ t('story.brief') }}</h2>
          <span class="brief-hint">{{ t('story.briefReadonlyHint') }}</span>
        </div>
        <div class="brief-body">
          <label for="story-brief-display" class="sr-only">{{ t('story.brief') }}</label>
          <textarea
            id="story-brief-display"
            class="brief-textarea"
            readonly
            aria-readonly="true"
            :aria-label="t('story.brief')"
            :value="drama.description || ''"
            rows="3"
            :placeholder="t('story.briefPlaceholder')"
          ></textarea>
        </div>
      </div>

      <!-- Episode Selector & Controls -->
      <div v-if="!episodes.length" class="card state-box">
        <p>{{ t('story.noEpisodes') }}</p>
      </div>

      <div v-else class="episode-section">
        <div class="card ep-selector-card">
          <div class="ep-selector-head">
            <span class="ep-label">{{ t('story.selectEpisode') }}:</span>
            <div class="ep-pills" role="tablist">
              <button
                v-for="ep in episodes"
                :key="ep.id"
                role="tab"
                :aria-selected="currentEpisode?.id === ep.id"
                :class="['ep-pill-btn', { active: currentEpisode?.id === ep.id }]"
                @click="selectEpisode(ep)"
              >
                EP {{ String(ep.episode_number || ep.episodeNumber).padStart(2, '0') }}
              </button>
            </div>
          </div>

          <div v-if="currentEpisode" class="ep-stats-summary">
            <div class="stats-left">
              <span class="stat-badge">
                {{ t('story.totalDuration', { sec: episodeTotalSeconds, formatted: formattedDuration }) }}
              </span>
              <span class="stat-badge">
                {{ t('story.readiness', { percent: readiness.percent }) }}
              </span>
            </div>
            <button
              class="btn btn-primary studio-link-btn"
              :aria-label="t('story.openStudio', { n: currentEpisode.episode_number || currentEpisode.episodeNumber })"
              @click="navigateTo(`/drama/${drama.id}/episode/${currentEpisode.episode_number || currentEpisode.episodeNumber}`)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
              {{ t('story.openStudio', { n: currentEpisode.episode_number || currentEpisode.episodeNumber }) }}
            </button>
          </div>
        </div>

        <!-- Episode Shots Load Error State -->
        <div v-if="episodeLoadError" class="card state-box error-box" role="alert">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p class="error-msg">{{ episodeLoadError }}</p>
          <button class="btn btn-primary" @click="retryCurrentEpisode">{{ t('story.retry') }}</button>
        </div>

        <!-- Shots Loading State -->
        <div v-else-if="loadingShots" class="card state-box" role="status" aria-live="polite">
          <div class="spinner"></div>
          <p>{{ t('story.loading') }}</p>
        </div>

        <!-- No Shots State -->
        <div v-else-if="!sortedShots.length" class="card state-box">
          <p>{{ t('story.noShots') }}</p>
        </div>

        <!-- Shots & Results List -->
        <div v-else>
          <!-- Merge Fetch Error Banner (allows retrying merge without dropping loaded shots) -->
          <div v-if="mergeLoadError" class="card merge-error-box" role="alert">
            <span class="error-msg">{{ mergeLoadError }}</span>
            <button class="btn btn-secondary btn-sm" @click="retryMerge">{{ t('story.retryMerge') }}</button>
          </div>

          <!-- Final Video Result (if available) -->
          <div v-if="finalVideoUrl" class="card final-video-card">
            <div class="card-head">
              <h2 class="section-title">{{ t('story.finalVideoTitle') }}</h2>
            </div>
            <div class="final-video-wrapper">
              <video :src="finalVideoUrl" controls class="final-video-player"></video>
            </div>
          </div>

          <div class="shots-grid">
            <div
              v-for="shot in sortedShots"
              :key="shot.id"
              class="card shot-card"
            >
              <div class="shot-card-head">
                <span class="shot-tag">
                  {{ t('story.shotCard', { n: shot.storyboard_number ?? shot.storyboardNumber ?? shot.id }) }}
                </span>
                <span class="shot-duration">{{ t('story.duration', { sec: shot.duration || 0 }) }}</span>
              </div>

              <div class="shot-media-box">
                <video
                  v-if="shotVideoUrl(shot)"
                  :src="shotVideoUrl(shot)"
                  controls
                  class="shot-media"
                ></video>
                <img
                  v-else-if="shotImageUrl(shot)"
                  :src="shotImageUrl(shot)"
                  :alt="shot.description || shot.video_prompt || 'Shot image'"
                  class="shot-media"
                  loading="lazy"
                />
                <div v-else class="media-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>{{ t('story.noImage') }}</span>
                </div>
              </div>

              <div class="shot-details">
                <div v-if="shot.description" class="shot-action-text">
                  {{ shot.description }}
                </div>
                <div v-if="shotPrompt(shot)" class="shot-prompt-text">
                  {{ shotPrompt(shot) }}
                </div>
                <div class="shot-footer">
                  <span class="shot-status-badge">{{ t('story.status', { status: shot.status || 'pending' }) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from '#app'
import { useI18n } from 'vue-i18n'
import { dramaAPI, episodeAPI, mergeAPI } from '~/composables/useApi'
import {
  computeTotalSeconds,
  sortStoryboards,
  calculateReadiness,
  resolveFinalVideo,
  formatDuration,
  createAsyncRequestGuard,
  sanitizeMediaUrl,
  extractGeneratedPrompt,
  extractSafeShotImage,
} from '~/utils/story-mode.mjs'

const { t } = useI18n()
const route = useRoute()

const dramaId = computed(() => {
  const val = Number(route.params.id)
  return Number.isFinite(val) && val > 0 ? val : null
})

const drama = ref(null)
const episodes = ref([])
const currentEpisode = ref(null)
const storyboards = ref([])
const merges = ref([])

const loadingDrama = ref(true)
const loadingShots = ref(false)
const loadError = ref(null)
const episodeLoadError = ref(null)
const mergeLoadError = ref(null)

const dramaGuard = createAsyncRequestGuard()
const episodeGuard = createAsyncRequestGuard()

function shotVideoUrl(shot) {
  return sanitizeMediaUrl(shot?.video_url ?? shot?.videoUrl)
}

function shotImageUrl(shot) {
  return extractSafeShotImage(shot)
}

function shotPrompt(shot) {
  return extractGeneratedPrompt(shot) || ''
}

const sortedShots = computed(() => sortStoryboards(storyboards.value))

const episodeTotalSeconds = computed(() => computeTotalSeconds(storyboards.value))

const formattedDuration = computed(() => formatDuration(episodeTotalSeconds.value))

const readiness = computed(() => calculateReadiness(storyboards.value))

const finalVideoUrl = computed(() => {
  return resolveFinalVideo(currentEpisode.value, merges.value)
})

async function selectEpisode(ep) {
  if (!ep) return
  currentEpisode.value = ep
  storyboards.value = []
  merges.value = []
  episodeLoadError.value = null
  mergeLoadError.value = null
  loadingShots.value = true

  const guardHandle = episodeGuard.start(ep.id)

  try {
    const shotsData = await episodeAPI.storyboards(ep.id)
    if (!episodeGuard.isLatest(guardHandle)) return
    storyboards.value = Array.isArray(shotsData) ? shotsData : (shotsData?.items || [])
  } catch (err) {
    if (episodeGuard.isLatest(guardHandle)) {
      episodeLoadError.value = err?.message || t('story.errorEpisode')
      storyboards.value = []
    }
  } finally {
    if (episodeGuard.isLatest(guardHandle)) {
      loadingShots.value = false
    }
  }

  // Load merges independently without removing successfully loaded shots
  if (episodeGuard.isLatest(guardHandle)) {
    try {
      const mergesData = await mergeAPI.list(ep.id)
      if (episodeGuard.isLatest(guardHandle)) {
        merges.value = Array.isArray(mergesData) ? mergesData : []
      }
    } catch (err) {
      if (episodeGuard.isLatest(guardHandle)) {
        mergeLoadError.value = err?.message || t('story.errorMerge')
        merges.value = []
      }
    }
  }
}

async function retryMerge() {
  if (!currentEpisode.value) return
  mergeLoadError.value = null
  const epId = currentEpisode.value.id
  const guardHandle = episodeGuard.start(epId)
  try {
    const mergesData = await mergeAPI.list(epId)
    if (episodeGuard.isLatest(guardHandle)) {
      merges.value = Array.isArray(mergesData) ? mergesData : []
    }
  } catch (err) {
    if (episodeGuard.isLatest(guardHandle)) {
      mergeLoadError.value = err?.message || t('story.errorMerge')
    }
  }
}

function retryCurrentEpisode() {
  if (currentEpisode.value) {
    selectEpisode(currentEpisode.value)
  }
}

async function loadData() {
  // Always invalidate older requests on route transitions, even for invalid IDs
  episodeGuard.invalidate()
  const id = dramaId.value
  const guardHandle = dramaGuard.start(id)

  if (!id) {
    loadingDrama.value = false
    loadError.value = t('story.errorInvalidId')
    drama.value = null
    episodes.value = []
    currentEpisode.value = null
    storyboards.value = []
    merges.value = []
    episodeLoadError.value = null
    mergeLoadError.value = null
    return
  }

  loadingDrama.value = true
  loadError.value = null
  drama.value = null
  episodes.value = []
  currentEpisode.value = null
  storyboards.value = []
  merges.value = []
  episodeLoadError.value = null
  mergeLoadError.value = null

  try {
    const data = await dramaAPI.get(id)
    if (!dramaGuard.isLatest(guardHandle)) return

    drama.value = data
    episodes.value = Array.isArray(data?.episodes) ? data.episodes : []

    if (episodes.value.length > 0) {
      await selectEpisode(episodes.value[0])
    }
  } catch (err) {
    if (dramaGuard.isLatest(guardHandle)) {
      loadError.value = err?.message || t('story.errorTitle')
    }
  } finally {
    if (dramaGuard.isLatest(guardHandle)) {
      loadingDrama.value = false
    }
  }
}

watch(() => route.params.id, () => {
  loadData()
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}

.story-mode-page {
  padding: 1.5rem;
  max-width: 1400px;
  margin: 0 auto;
}

.state-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  gap: 1rem;
  color: var(--text-2);
}

.error-box {
  color: var(--action-danger, #dc2626);
}

.error-msg {
  color: var(--action-danger, #dc2626);
  font-size: 0.95rem;
}

.merge-error-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: var(--surface-soft, rgba(220, 38, 38, 0.05));
  border: 1px solid var(--border);
}

.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(128, 128, 128, 0.2);
  border-top-color: var(--accent, #f97316);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.story-content {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.episode-section {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.page-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.15rem 1.25rem;
}

.back-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-0);
  border-radius: 0.5rem;
  padding: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.head-info {
  flex: 1;
}

.head-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.page-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-0);
}

.head-sub {
  font-size: 0.85rem;
  color: var(--text-2);
  margin: 0.25rem 0 0;
}

.tag-accent {
  background: var(--accent-bg, rgba(249, 115, 22, 0.1));
  color: var(--accent-text, #ea580c);
  padding: 0.2rem 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.pending-ai-btn {
  opacity: 0.6;
  cursor: not-allowed;
}

.brief-card {
  padding: 1.15rem 1.25rem;
}

.brief-card .card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.section-title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0;
  color: var(--text-0);
}

.brief-hint {
  font-size: 0.8rem;
  color: var(--text-2);
}

.brief-textarea {
  width: 100%;
  background: var(--bg-input, var(--surface-input));
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  color: var(--text-0);
  padding: 0.75rem;
  font-size: 0.9rem;
  resize: vertical;
  box-sizing: border-box;
}

.ep-selector-card {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.15rem 1.25rem;
}

.ep-selector-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.ep-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-2);
}

.ep-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.ep-pill-btn {
  background: var(--bg-input, var(--surface-input));
  border: 1px solid var(--border);
  color: var(--text-2);
  border-radius: 0.375rem;
  padding: 0.35rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.ep-pill-btn.active {
  background: var(--accent, #f97316);
  color: #fff;
  border-color: var(--accent, #f97316);
}

.ep-stats-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
  gap: 0.5rem;
}

.stats-left {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.stat-badge {
  font-size: 0.8rem;
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  padding: 0.25rem 0.6rem;
  border-radius: 0.375rem;
  color: var(--text-0);
}

.final-video-card {
  margin-top: 1rem;
  padding: 1.15rem 1.25rem;
}

.final-video-wrapper {
  margin-top: 0.75rem;
  border-radius: 0.5rem;
  overflow: hidden;
  max-width: 640px;
  background: #000;
}

.final-video-player {
  width: 100%;
  display: block;
}

.shots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1rem;
  margin-top: 1rem;
}

.shot-card {
  display: flex;
  flex-direction: column;
  padding: 0.9rem;
  margin-bottom: 0;
}

.shot-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.shot-tag {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--accent, #f97316);
}

.shot-duration {
  font-size: 0.75rem;
  color: var(--text-2);
}

.shot-media-box {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: var(--bg-base, #111);
  border-radius: 0.375rem;
  overflow: hidden;
  margin-bottom: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shot-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.media-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-3);
  font-size: 0.75rem;
}

.shot-details {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.8rem;
}

.shot-action-text {
  color: var(--text-0);
  font-weight: 500;
  line-height: 1.3;
}

.shot-prompt-text {
  color: var(--text-2);
  font-size: 0.75rem;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

.shot-footer {
  margin-top: 0.25rem;
}

.shot-status-badge {
  font-size: 0.7rem;
  color: var(--text-2);
  background: var(--bg-hover, rgba(0, 0, 0, 0.05));
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}
</style>
