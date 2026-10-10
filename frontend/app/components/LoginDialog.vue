<template>
  <Teleport to="body">
    <div v-if="isLoginDialogOpen" class="overlay" @click.self="onOverlayClick">
      <div class="dialog login-dialog" role="dialog" aria-modal="true" :aria-label="t('auth.loginTitle')">
        <div class="login-icon">
          <KeyRound :size="22" :stroke-width="1.8" />
        </div>
        <h2 class="login-title">{{ t('auth.loginTitle') }}</h2>
        <p class="login-subtitle">{{ t('auth.loginSubtitle') }}</p>

        <form class="login-form" @submit.prevent="handleLogin">
          <div class="input-group">
            <label for="tora-api-key" class="input-label">{{ t('auth.keyLabel') }}</label>
            <div class="input-wrapper">
              <input
                id="tora-api-key"
                v-model="apiKeyInput"
                :type="showKey ? 'text' : 'password'"
                class="key-input"
                :placeholder="t('auth.keyPlaceholder')"
                autofocus
                :disabled="isLoading"
                autocomplete="off"
                spellcheck="false"
              />
              <button
                type="button"
                class="toggle-visibility"
                :title="showKey ? 'Hide' : 'Show'"
                @click="showKey = !showKey"
              >
                <EyeOff v-if="showKey" :size="15" />
                <Eye v-else :size="15" />
              </button>
            </div>
          </div>

          <div v-if="errorMessage" class="login-error">
            <AlertCircle :size="14" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="login-notice">
            <Info :size="14" class="notice-icon" />
            <span>{{ t('auth.zeroCreditsNotice') }}</span>
          </div>

          <div class="login-actions">
            <button
              v-if="!isServerMode || isAuthenticated"
              type="button"
              class="btn"
              :disabled="isLoading"
              @click="closeLoginDialog"
            >
              {{ t('common.cancel') }}
            </button>
            <button
              type="submit"
              class="btn btn-primary"
              :disabled="isLoading || !apiKeyInput.trim()"
            >
              <Loader2 v-if="isLoading" :size="15" class="spin" />
              <span>{{ isLoading ? t('auth.loggingIn') : t('auth.loginBtn') }}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { KeyRound, Eye, EyeOff, AlertCircle, Info, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/composables/useAuth'

const { t } = useI18n()
const {
  isLoginDialogOpen,
  isServerMode,
  isAuthenticated,
  isLoading,
  login,
  closeLoginDialog,
} = useAuth()

const apiKeyInput = ref('')
const showKey = ref(false)
const errorMessage = ref('')

function onOverlayClick() {
  if (!isServerMode.value || isAuthenticated.value) {
    closeLoginDialog()
  }
}

async function handleLogin() {
  const key = apiKeyInput.value.trim()
  if (!key) return
  errorMessage.value = ''
  try {
    await login(key)
    apiKeyInput.value = ''
  } catch (err: any) {
    errorMessage.value = err.message || t('auth.invalidKey')
  }
}
</script>

<style scoped>
.login-dialog {
  width: 440px;
  max-width: calc(100vw - 32px);
  padding: 28px 24px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.login-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent-bg, rgba(235, 94, 40, 0.12));
  color: var(--accent, #eb5e28);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
}

.login-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-0);
  margin-bottom: 6px;
}

.login-subtitle {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
  margin-bottom: 20px;
  max-width: 360px;
}

.login-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-1);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.key-input {
  width: 100%;
  padding: 9px 36px 9px 12px;
  background: var(--bg-1, #1e1e24);
  border: 1px solid var(--border-color, #333);
  border-radius: 6px;
  color: var(--text-0);
  font-size: 13.5px;
  font-family: monospace;
  outline: none;
  transition: border-color 0.15s;
}

.key-input:focus {
  border-color: var(--accent, #eb5e28);
}

.toggle-visibility {
  position: absolute;
  right: 10px;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 4px;
}

.toggle-visibility:hover {
  color: var(--text-1);
}

.login-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--action-danger-bg, rgba(239, 68, 68, 0.1));
  color: var(--action-danger, #ef4444);
  border-radius: 6px;
  font-size: 12.5px;
  text-align: left;
}

.login-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-1, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-2);
}

.notice-icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: var(--accent, #eb5e28);
}

.login-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}

.login-actions .btn {
  flex: 1;
}

.spin {
  animation: spin 1s linear infinite;
  margin-right: 6px;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
