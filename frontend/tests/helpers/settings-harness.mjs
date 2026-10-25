import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { parse } from '@vue/compiler-sfc'

export const settingsSource = readFileSync(new URL('../../app/pages/settings.vue', import.meta.url), 'utf8')

export function settingsHarness(overrides = {}) {
  const mounted = []
  const unmounted = []
  const calls = []
  const errors = []
  const intervals = []
  const api = new Proxy({}, { get: (_, name) => async (...args) => { calls.push([name, ...args]); return [] } })
  const context = {
    ref, reactive, computed, watch,
    onMounted: callback => mounted.push(callback),
    onBeforeUnmount: callback => unmounted.push(callback),
    aiConfigAPI: api, flowBridgeAPI: api, promptAPI: api, skillsAPI: api, storageAPI: api,
    stylePresetAPI: api, settingsAPI: { contentLanguage: async () => { throw new Error('Not part of auth fixture') } }, serverUpdateAPI: api,
    authAPI: {
      login: async key => { calls.push(['login', key]) },
      me: async () => { calls.push(['me']); return { authenticated: true } },
      logout: async () => { calls.push(['logout']) },
      models: async () => { calls.push(['models']); return { chat: [], image: [], vdo: [], unknown: [] } },
    },
    toast: new Proxy({}, { get: (_, name) => message => calls.push([name, message]) }),
    toastError: error => errors.push(error),
    useI18n: () => ({ t: key => key, te: () => false, locale: ref('en') }),
    useTheme: () => ({ themeMode: ref('system'), setThemeMode() {} }),
    useDesktopBridge: () => null,
    useMigrateState: () => ({ begin() {}, update() {}, end() {} }),
    providerIconUrl: () => null,
    setTimeout: () => 1,
    setInterval: callback => { intervals.push(callback); return intervals.length },
    clearInterval() {},
    document: { hidden: false }, console,
    ...overrides,
  }
  const { descriptor } = parse(settingsSource)
  const script = descriptor.scriptSetup.content.replace(/^import .*$/gm, '')
  const names = ['quickProviderTab', 'toraApiKey', 'toraBusy', 'toraAuthenticated', 'toraError', 'toraChecking',
    'loginTora', 'logoutTora', 'loadToraSession', 'loadCfgs', 'cfgs', 'toraCatalog', 'toraManagedMode', 'providerPresets', 'flowQuickConfigs',
    'flowProxyQuickConfigs', 'antigravityQuickConfigs', 'geminiQuickConfigs', 'openaiQuickConfigs']
  vm.runInNewContext(`${script}\nglobalThis.state = { ${names.map(name => `${name}: typeof ${name} === 'undefined' ? undefined : ${name}`).join(',')} }`, context)
  return { state: context.state, calls, errors, intervals, mounted, unmounted, nextTick }
}
