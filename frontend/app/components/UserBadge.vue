<template>
  <div class="user-badge-container">
    <!-- Logged in state -->
    <div v-if="isAuthenticated && user" class="user-pill-wrapper">
      <button
        type="button"
        class="user-pill"
        :class="{ active: isMenuOpen }"
        @click="toggleMenu"
      >
        <div class="user-avatar">
          <User :size="13" />
        </div>
        <span class="user-name">{{ user.displayName || user.username }}</span>
        <div v-if="credits" class="credit-badge" :title="`Spendable quota: ${credits.spendableQuota}`">
          <Coins :size="12" class="credit-icon" />
          <span>{{ formatCredits(credits.spendableCredit) }}</span>
        </div>
        <ChevronDown :size="12" class="chevron-icon" :class="{ rotate: isMenuOpen }" />
      </button>

      <!-- Dropdown Menu -->
      <div v-if="isMenuOpen" class="user-menu" @click.stop>
        <div class="menu-header">
          <div class="menu-user-title">{{ user.displayName || user.username }}</div>
          <div class="menu-user-sub">@{{ user.username }} (ID: {{ user.id }})</div>
          <div v-if="token" class="menu-token-info">Key: {{ token.maskedKey }}</div>
        </div>

        <div v-if="credits" class="menu-credit-section">
          <div class="credit-row">
            <span class="credit-label">{{ t('auth.creditsLabel') }}</span>
            <span class="credit-val">{{ formatCredits(credits.spendableCredit) }}</span>
          </div>
          <div v-if="credits.spendableCredit <= 0" class="zero-credit-hint">
            {{ t('auth.zeroCreditsNotice') }}
          </div>
        </div>

        <div class="menu-divider" />

        <button type="button" class="menu-item logout-btn" @click="handleLogout">
          <LogOut :size="14" />
          <span>{{ t('auth.logoutBtn') }}</span>
        </button>
      </div>
    </div>

    <!-- Not logged in state -->
    <div v-else class="anon-actions">
      <button
        type="button"
        class="btn btn-sm login-trigger-btn"
        @click="openLoginDialog"
      >
        <LogIn :size="13" />
        <span>{{ isServerMode ? t('auth.loginBtn') : t('auth.connectTora') }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { User, Coins, ChevronDown, LogOut, LogIn } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useAuth } from '~/composables/useAuth'

const { t } = useI18n()
const {
  user,
  token,
  credits,
  isAuthenticated,
  isServerMode,
  logout,
  openLoginDialog,
} = useAuth()

const isMenuOpen = ref(false)

function toggleMenu() {
  isMenuOpen.value = !isMenuOpen.value
}

function closeMenu() {
  isMenuOpen.value = false
}

function handleLogout() {
  closeMenu()
  logout()
}

function formatCredits(num?: number): string {
  if (num === undefined || num === null) return '0.00'
  return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function onDocumentClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.user-badge-container')) {
    closeMenu()
  }
}

onMounted(() => {
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onDocumentClick)
  }
})

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', onDocumentClick)
  }
})
</script>

<style scoped>
.user-badge-container {
  position: relative;
  display: flex;
  align-items: center;
}

.user-pill-wrapper {
  position: relative;
}

.user-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px 4px 6px;
  background: var(--bg-1, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  border-radius: 20px;
  color: var(--text-0);
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.user-pill:hover,
.user-pill.active {
  background: var(--bg-2, rgba(255, 255, 255, 0.08));
  border-color: var(--border-hover, rgba(255, 255, 255, 0.15));
}

.user-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent-bg, rgba(235, 94, 40, 0.15));
  color: var(--accent, #eb5e28);
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-name {
  font-weight: 500;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.credit-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  background: rgba(235, 94, 40, 0.12);
  color: var(--accent, #eb5e28);
  border-radius: 10px;
  font-size: 11.5px;
  font-weight: 600;
}

.credit-icon {
  color: var(--accent, #eb5e28);
}

.chevron-icon {
  color: var(--text-3);
  transition: transform 0.2s;
}

.chevron-icon.rotate {
  transform: rotate(180deg);
}

.login-trigger-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
}

.user-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 240px;
  background: var(--bg-surface, #1e1e24);
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  padding: 8px 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  z-index: 1000;
}

.menu-header {
  padding: 8px 14px;
}

.menu-user-title {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-0);
}

.menu-user-sub {
  font-size: 11.5px;
  color: var(--text-2);
  margin-top: 2px;
}

.menu-token-info {
  font-size: 11px;
  color: var(--text-3);
  font-family: monospace;
  margin-top: 4px;
}

.menu-credit-section {
  padding: 8px 14px;
  background: var(--bg-1, rgba(255, 255, 255, 0.03));
  margin: 4px 8px;
  border-radius: 6px;
}

.credit-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12.5px;
}

.credit-label {
  color: var(--text-2);
}

.credit-val {
  font-weight: 700;
  color: var(--accent, #eb5e28);
}

.zero-credit-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--text-3);
  margin-top: 6px;
}

.menu-divider {
  height: 1px;
  background: var(--border-color, rgba(255, 255, 255, 0.08));
  margin: 6px 0;
}

.menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: transparent;
  border: none;
  color: var(--text-1);
  font-size: 12.5px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--bg-2, rgba(255, 255, 255, 0.06));
}

.logout-btn {
  color: var(--action-danger, #ef4444);
}

.logout-btn:hover {
  background: var(--action-danger-bg, rgba(239, 68, 68, 0.1));
}
</style>
