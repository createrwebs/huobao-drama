import { ref } from 'vue'
import { authAPI } from './useApi'

export interface AuthUser {
  id: number
  externalUserId: number
  username: string
  displayName: string
  issuer: string
}

export interface AuthToken {
  id: number
  maskedKey: string
  expiresAt?: number
}

export interface AuthCredits {
  userId: number
  tokenId: number
  tokenUnlimited: boolean
  tokenQuota: number
  userQuota: number
  spendableQuota: number
  spendableCredit: number
  quotaPerCredit: number
}

const user = ref<AuthUser | null>(null)
const token = ref<AuthToken | null>(null)
const credits = ref<AuthCredits | null>(null)
const isAuthenticated = ref(false)
const isServerMode = ref(false)
const isLoginDialogOpen = ref(false)
const isLoading = ref(false)
const authInitialized = ref(false)

let listenerAdded = false

export function useAuth() {
  if (typeof window !== 'undefined' && !listenerAdded) {
    listenerAdded = true
    window.addEventListener('huobao:unauthorized', () => {
      isAuthenticated.value = false
      user.value = null
      token.value = null
      credits.value = null
      if (isServerMode.value) {
        isLoginDialogOpen.value = true
      }
    })
  }

  async function checkAuth() {
    isLoading.value = true
    try {
      const res = await authAPI.me()
      if (res) {
        user.value = res.user || null
        token.value = res.token || null
        credits.value = res.credits || null
        isAuthenticated.value = Boolean(res.isAuthenticated)
        isServerMode.value = Boolean(res.isServerMode)
        if (isServerMode.value && !isAuthenticated.value) {
          isLoginDialogOpen.value = true
        }
      }
    } catch (err: any) {
      isAuthenticated.value = false
      user.value = null
      token.value = null
      credits.value = null
      if (err.message === '401' || err.message?.includes('Unauthorized')) {
        isServerMode.value = true
        isLoginDialogOpen.value = true
      }
    } finally {
      isLoading.value = false
      authInitialized.value = true
    }
  }

  async function login(apiKey: string) {
    isLoading.value = true
    try {
      const res = await authAPI.login(apiKey)
      if (res) {
        user.value = res.user
        token.value = res.token
        credits.value = res.credits
        isAuthenticated.value = true
        isLoginDialogOpen.value = false
        if (typeof window !== 'undefined') {
          window.location.reload()
        }
        return res
      }
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    isLoading.value = true
    try {
      await authAPI.logout()
    } catch {
      // Ignore logout errors
    } finally {
      user.value = null
      token.value = null
      credits.value = null
      isAuthenticated.value = false
      isLoading.value = false
      if (isServerMode.value) {
        isLoginDialogOpen.value = true
      }
      if (typeof window !== 'undefined') {
        window.location.reload()
      }
    }
  }

  function openLoginDialog() {
    isLoginDialogOpen.value = true
  }

  function closeLoginDialog() {
    if (!isServerMode.value || isAuthenticated.value) {
      isLoginDialogOpen.value = false
    }
  }

  return {
    user,
    token,
    credits,
    isAuthenticated,
    isServerMode,
    isLoginDialogOpen,
    isLoading,
    authInitialized,
    checkAuth,
    login,
    logout,
    openLoginDialog,
    closeLoginDialog,
  }
}
