<template>
  <div class="settings-page">
    <div class="settings-layout">
      <aside class="settings-nav">
        <div class="nav-group">
          <div class="nav-group-label">{{ t('settings.groupBase') }}</div>
          <button v-for="nt in baseTabs" :key="nt.id" :class="['nav-item', { active: tab === nt.id }]" @click="tab = nt.id">
            <component :is="nt.icon" :size="14" />
            {{ nt.label }}
          </button>
        </div>
      </aside>

      <div class="settings-content">

        <!-- ===== 通用（内容语言） ===== -->
        <div v-if="tab === 'general'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">{{ t('settings.general.title') }}</h2>
            <p class="settings-desc">{{ t('settings.general.desc') }}</p>
          </div>
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">{{ t('settings.general.contentLanguage') }}</span>
                <div class="svc-group-sub">{{ t('settings.general.contentLanguageSub') }}</div>
              </div>
            </div>
            <div class="config-row">
              <div class="provider-badge" style="background:var(--accent-bg);color:var(--accent)"><Languages :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.general.languageLabel') }}</span></div>
                <div class="config-sub">{{ t('settings.general.languageNote') }}</div>
              </div>
              <div class="lang-picker">
                <button
                  v-for="l in contentLangOptions"
                  :key="l.value"
                  type="button"
                  :class="['lang-option', { on: contentLanguage === l.value }]"
                  @click="setContentLanguage(l.value)"
                >{{ l.label }}</button>
              </div>
            </div>
            <p class="config-empty">{{ t('settings.general.languageHint') }}</p>
          </section>

          <!-- 外观主题 -->
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">{{ t('settings.general.appearance') }}</span>
                <div class="svc-group-sub">{{ t('settings.general.appearanceSub') }}</div>
              </div>
            </div>
            <div class="config-row">
              <div class="provider-badge" style="background:var(--accent-bg);color:var(--accent)"><SunMoon :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.general.appearanceLabel') }}</span></div>
                <div class="config-sub">{{ t('settings.general.appearanceNote') }}</div>
              </div>
              <div class="lang-picker">
                <button
                  v-for="o in themeOptions"
                  :key="o.value"
                  type="button"
                  :class="['lang-option', { on: themeMode === o.value }]"
                  @click="setThemeMode(o.value)"
                >{{ o.label }}</button>
              </div>
            </div>
          </section>
        </div>

        <!-- ===== AI 服务配置 ===== -->
        <div v-if="tab === 'ai'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">{{ t('settings.ai.title') }}</h2>
            <p class="settings-desc">{{ t('settings.ai.desc') }}</p>
          </div>
          <section class="card quick-card">
            <div class="quick-card-head">
              <div class="setup-title">{{ t('settings.ai.quickTitle') }}</div>
              <div class="lang-picker ml-auto">
                <button
                  type="button"
                  :class="['lang-option', { on: quickProviderTab === 'antigravity' }]"
                  @click="quickProviderTab = 'antigravity'"
                >
                  <img v-if="providerIconUrl('antigravity')" :src="providerIconUrl('antigravity')" class="quick-tab-icon" alt="" />
                  {{ t('settings.ai.tabAntigravity') }}
                </button>
                <button
                  type="button"
                  :class="['lang-option', { on: quickProviderTab === 'flow' }]"
                  @click="quickProviderTab = 'flow'"
                >
                  <img v-if="providerIconUrl('google_flow')" :src="providerIconUrl('google_flow')" class="quick-tab-icon" alt="" />
                  {{ t('settings.ai.tabFlow') }}
                </button>
                <button
                  type="button"
                  :class="['lang-option', { on: quickProviderTab === 'gemini' }]"
                  @click="quickProviderTab = 'gemini'"
                >
                  <img v-if="providerIconUrl('gemini')" :src="providerIconUrl('gemini')" class="quick-tab-icon" alt="" />
                  {{ t('settings.ai.tabGemini') }}
                </button>
                <button
                  type="button"
                  :class="['lang-option', { on: quickProviderTab === 'openai' }]"
                  @click="quickProviderTab = 'openai'"
                >
                  <img v-if="providerIconUrl('openai')" :src="providerIconUrl('openai')" class="quick-tab-icon" alt="" />
                  {{ t('settings.ai.tabOpenai') }}
                </button>
                <button
                  type="button"
                  :class="['lang-option', { on: quickProviderTab === 'firemux' }]"
                  @click="quickProviderTab = 'firemux'"
                >
                  <img v-if="providerIconUrl('firemux')" :src="providerIconUrl('firemux')" class="quick-tab-icon" alt="" />
                  {{ t('settings.ai.tabFiremux') }}
                </button>
              </div>
            </div>

            <!-- Google Antigravity Quick Setup (Free Text / Gemini Models) -->
            <div v-if="quickProviderTab === 'antigravity'">
              <p class="setup-desc">
                {{ t('settings.ai.antigravityQuickDesc') }}
              </p>
              <div class="flow-status-banner mb-3 p-3 rounded border flex items-center justify-between" :style="antigravityStatus?.available ? 'border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.08);' : 'border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.08);'">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2.5 h-2.5 rounded-full" :style="antigravityStatus?.available ? 'background: #10b981;' : 'background: #f59e0b;'"></span>
                  <span v-if="antigravityChecking" class="text-xs">{{ t('settings.ai.antigravityStatusChecking') }}</span>
                  <span v-else-if="antigravityStatus?.available" class="text-xs font-medium" style="color: #10b981;">
                    {{ t('settings.ai.antigravityStatusConnected') }}
                  </span>
                  <span v-else class="text-xs" style="color: #f59e0b;">
                    {{ t('settings.ai.antigravityStatusDisconnected') }}
                  </span>
                </div>
                <button class="btn btn-ghost btn-xs" :disabled="antigravityChecking" @click="refreshAntigravityStatus">
                  <RefreshCw :size="12" :class="{ 'animate-spin': antigravityChecking }" />
                  {{ t('settings.ai.test') }}
                </button>
              </div>
              <div class="flex flex-wrap gap-2 mb-3">
                <button class="btn btn-primary" :disabled="antigravitySaving" @click="applyAntigravityQuickConfig">
                  <Loader2 v-if="antigravitySaving" :size="13" class="animate-spin" />
                  <Sparkles v-else :size="13" />
                  {{ t('settings.ai.applyAntigravity') }}
                </button>
              </div>
              <div class="huobao-quick-models">
                <div v-for="q in antigravityQuickConfigs" :key="q.name" class="hqm-row">
                  <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                  <span class="hqm-provider">
                    <img v-if="providerIconUrl(q.provider)" :src="providerIconUrl(q.provider)" class="hqm-provider-icon" alt="" />
                    {{ q.provider }}
                  </span>
                  <span class="hqm-models mono">
                    <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                      {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Google Flow Quick Setup (Google One Session) -->
            <div v-else-if="quickProviderTab === 'flow'">
              <p class="setup-desc">
                {{ t('settings.ai.flowQuickDesc') }}
              </p>
              <div class="flow-status-banner mb-3 p-3 rounded border flex items-center justify-between" :style="flowStatus?.available ? 'border-color: rgba(16, 185, 129, 0.3); background: rgba(16, 185, 129, 0.08);' : 'border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.08);'">
                <div class="flex items-center gap-2">
                  <span class="inline-block w-2.5 h-2.5 rounded-full" :style="flowStatus?.available ? 'background: #10b981;' : 'background: #f59e0b;'"></span>
                  <span v-if="flowChecking" class="text-xs">{{ t('settings.ai.flowStatusChecking') }}</span>
                  <span v-else-if="flowStatus?.available" class="text-xs font-medium" style="color: #10b981;">
                    {{ t('settings.ai.flowStatusConnected', { accounts: flowStatus.activeAccounts, credits: flowStatus.totalCredits ?? '--' }) }}
                  </span>
                  <span v-else class="text-xs" style="color: #f59e0b;">
                    {{ t('settings.ai.flowStatusDisconnected') }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <button class="btn btn-ghost btn-xs" :disabled="flowChecking" @click="refreshFlowStatus(true)">
                    <RefreshCw :size="12" :class="{ 'animate-spin': flowChecking }" />
                    {{ t('settings.ai.test') }}
                  </button>
                  <button class="btn btn-outline btn-xs" @click="openFlowImportModal">
                    <Plus :size="12" />
                    {{ t('settings.ai.flowImportBtn') }}
                  </button>
                </div>
              </div>

              <p v-if="flowStatus?.lastError" class="text-xs text-danger mb-3" role="alert">{{ flowStatus.lastError }}</p>

              <!-- Google Flow Accounts List & Switcher -->
              <div class="flow-accounts-section mb-3">
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-semibold text-muted flex items-center gap-1.5">
                    <Layers :size="13" />
                    {{ t('settings.ai.flowAccountsTitle') }} ({{ flowAccounts.length }})
                  </span>
                </div>

                <div v-if="flowAccounts.length === 0" class="p-3 text-center text-xs text-muted border rounded" style="border-style: dashed;">
                  {{ t('settings.ai.flowNoAccounts') }}
                </div>

                <div v-else class="flex flex-col gap-2">
                  <div
                    v-for="acc in flowAccounts"
                    :key="acc.id"
                    class="p-2.5 rounded border flex items-center justify-between"
                    :style="acc.is_active ? 'border-color: rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.06);' : 'border-color: var(--border); background: var(--bg-1);'"
                  >
                    <div class="flex items-center gap-3 min-w-0">
                      <div class="flex items-center gap-1.5 shrink-0">
                        <span
                          class="w-2.5 h-2.5 rounded-full inline-block"
                          :style="acc.is_active ? 'background: #10b981; box-shadow: 0 0 6px rgba(16, 185, 129, 0.5);' : 'background: #94a3b8;'"
                        ></span>
                        <span
                          class="text-xs font-semibold"
                          :style="acc.is_active ? 'color: #10b981;' : 'color: var(--text-2);'"
                        >
                          {{ acc.is_active ? t('settings.ai.flowActiveBadge') : t('settings.ai.flowStandbyBadge') }}
                        </span>
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <span class="font-mono text-xs font-bold">{{ acc.id }}</span>
                          <span v-if="acc.credits !== null && acc.credits !== undefined" class="tag tag-accent text-xs">
                            {{ acc.credits }} credits
                          </span>
                          <span v-else class="tag text-xs" style="opacity: 0.6;">
                            -- credits
                          </span>
                          <span v-if="acc.cookies_count" class="text-xs font-mono" style="font-size: 10px; color: var(--text-2);">
                            ({{ acc.cookies_count }} cookies)
                          </span>
                        </div>
                        <div class="text-xs font-mono truncate" style="font-size: 11px; color: var(--text-2); max-width: 320px;" :title="acc.project_id">
                          Project: {{ acc.project_id || 'N/A' }}
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center gap-1.5 shrink-0">
                      <button
                        v-if="!acc.is_active"
                        class="btn btn-outline btn-xs"
                        :disabled="flowSwitchingId !== null || flowChecking"
                        @click="handleSwitchFlowAccount(acc)"
                      >
                        <Loader2 v-if="flowSwitchingId === acc.id" :size="12" class="animate-spin" />
                        <Check v-else :size="12" />
                        {{ t('settings.ai.flowSwitchAccount') }}
                      </button>
                      <button
                        class="btn btn-ghost btn-xs text-danger hover:bg-danger/10"
                        :title="t('common.delete')"
                        @click="handleDeleteFlowAccount(acc)"
                      >
                        <Trash2 :size="12" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap gap-2 mb-3">
                <button class="btn btn-primary" :disabled="flowSaving" @click="applyFlowQuickConfig('native')">
                  <Loader2 v-if="flowSaving" :size="13" class="animate-spin" />
                  <Sparkles v-else :size="13" />
                  {{ t('settings.ai.applyFlowNative') }}
                </button>
                <button class="btn btn-ghost" :disabled="flowSaving" @click="applyFlowQuickConfig('proxy')">
                  <Layers :size="13" />
                  {{ t('settings.ai.applyFlowProxy') }}
                </button>
              </div>
              <div class="text-xs text-muted mb-3" style="font-size: 11px; opacity: 0.85;">
                <p class="mb-1"><strong>{{ t('settings.ai.flowMethod1Desc') }}</strong></p>
                <p><strong>{{ t('settings.ai.flowMethod2Desc') }}</strong></p>
              </div>
              <div class="huobao-quick-models">
                <div v-for="q in flowQuickConfigs" :key="q.name" class="hqm-row">
                  <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                  <span class="hqm-provider">
                    <img v-if="providerIconUrl(q.provider)" :src="providerIconUrl(q.provider)" class="hqm-provider-icon" alt="" />
                    {{ q.provider }}
                  </span>
                  <span class="hqm-models mono">
                    <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                      {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Google Gemini Quick Setup (Default & Free) -->
            <div v-else-if="quickProviderTab === 'gemini'">
              <p class="setup-desc">
                {{ t('settings.ai.geminiQuickDesc') }}
                <a class="huobao-site-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">
                  {{ t('settings.ai.getGeminiKey') }}
                  <ExternalLink :size="12" :stroke-width="1.8" />
                </a>
              </p>
              <div class="huobao-quick-row">
                <input v-model="geminiApiKey" class="input" type="password" placeholder="Google Gemini API Key (AIzaSy...)" />
                <button class="btn btn-primary" :disabled="geminiSaving" @click="applyGeminiQuickConfig">
                  <Loader2 v-if="geminiSaving" :size="13" class="animate-spin" />
                  <Sparkles v-else :size="13" />
                  {{ t('settings.ai.applyGemini') }}
                </button>
              </div>
              <div class="huobao-quick-models">
                <div v-for="q in geminiQuickConfigs" :key="q.name" class="hqm-row">
                  <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                  <span class="hqm-provider">
                    <img v-if="providerIconUrl(q.provider)" :src="providerIconUrl(q.provider)" class="hqm-provider-icon" alt="" />
                    {{ q.provider }}
                  </span>
                  <span class="hqm-models mono">
                    <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                      {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- OpenAI Quick Setup -->
            <div v-else-if="quickProviderTab === 'openai'">
              <p class="setup-desc">
                {{ t('settings.ai.openaiQuickDesc') }}
                <a class="huobao-site-link" href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                  {{ t('settings.ai.getOpenaiKey') }}
                  <ExternalLink :size="12" :stroke-width="1.8" />
                </a>
              </p>
              <div class="huobao-quick-row">
                <input v-model="openaiApiKey" class="input" type="password" placeholder="OpenAI API Key (sk-...)" />
                <button class="btn btn-primary" :disabled="openaiSaving" @click="applyOpenaiQuickConfig">
                  <Loader2 v-if="openaiSaving" :size="13" class="animate-spin" />
                  <Sparkles v-else :size="13" />
                  {{ t('settings.ai.applyOpenai') }}
                </button>
              </div>
              <div class="huobao-quick-models">
                <div v-for="q in openaiQuickConfigs" :key="q.name" class="hqm-row">
                  <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                  <span class="hqm-provider">
                    <img v-if="providerIconUrl(q.provider)" :src="providerIconUrl(q.provider)" class="hqm-provider-icon" alt="" />
                    {{ q.provider }}
                  </span>
                  <span class="hqm-models mono">
                    <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                      {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <!-- Firemux Relay Quick Setup -->
            <div v-else-if="quickProviderTab === 'firemux'">
              <p class="setup-desc">
                {{ t('settings.ai.quickDesc') }}
                <a class="huobao-site-link" :href="huobaoSiteUrl" target="_blank" rel="noopener noreferrer">
                  {{ t('settings.ai.getKey') }}
                  <ExternalLink :size="12" :stroke-width="1.8" />
                </a>
              </p>
              <div class="huobao-quick-row">
                <input v-model="huobaoApiKey" class="input" type="password" placeholder="Huobao API Key" />
                <div class="lang-picker">
                  <button
                    type="button"
                    :class="['lang-option', { on: huobaoRegion === 'cn' }]"
                    @click="huobaoRegion = 'cn'"
                  >{{ t('settings.ai.regionCn') }}</button>
                  <button
                    type="button"
                    :class="['lang-option', { on: huobaoRegion === 'com' }]"
                    @click="huobaoRegion = 'com'"
                  >{{ t('settings.ai.regionCom') }}</button>
                </div>
                <button class="btn btn-primary" :disabled="huobaoSaving" @click="applyHuobaoQuickConfig">
                  <Loader2 v-if="huobaoSaving" :size="13" class="animate-spin" />
                  <Sparkles v-else :size="13" />
                  {{ t('settings.ai.applyQuick') }}
                </button>
              </div>
              <div class="huobao-quick-models">
                <div v-for="q in huobaoQuickConfigs" :key="q.name" class="hqm-row">
                  <span class="hqm-label">{{ serviceMeta[q.service_type].label }}</span>
                  <span class="hqm-provider">
                    <img v-if="providerIconUrl(q.provider)" :src="providerIconUrl(q.provider)" class="hqm-provider-icon" alt="" />
                    {{ q.provider }}
                  </span>
                  <span class="hqm-models mono">
                    <span v-for="(m, i) in q.model" :key="m" :class="['hqm-model', { 'is-default': i === 0 }]">
                      {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </section>
          <section class="card setup-panel">
            <div class="setup-panel-head compact">
              <div>
                <div class="setup-title">{{ t('settings.ai.manualTitle') }}</div>
                <div class="setup-desc">{{ t('settings.ai.manualDesc') }}</div>
              </div>
            </div>
            <div class="template-row">
              <button
                v-for="st in serviceTypes"
                :key="st.type"
                class="template-type-chip"
                @click="startAddCfg(st.type)"
              >
                {{ st.label }}
              </button>
            </div>
          </section>
          <div class="sections">
            <section v-for="st in serviceTypes" :key="st.type" class="card svc-group">
              <div class="svc-group-head">
                <div class="svc-group-heading">
                  <span class="svc-group-title">{{ st.label }}</span>
                  <div class="svc-group-sub">{{ serviceMeta[st.type].desc }}</div>
                </div>
                <span v-if="countActive(st.type)" class="tag tag-accent">{{ t('settings.ai.activeCount', { n: countActive(st.type) }) }}</span>
                <button class="btn btn-ghost btn-sm ml-auto" @click="startAddCfg(st.type)"><Plus :size="13" /> {{ t('common.add') }}</button>
              </div>
              <div v-for="c in byType(st.type)" :key="c.id" class="config-row">
                <div class="provider-badge" :class="{ 'has-icon': !!providerIconUrl(c.provider) }" :data-provider="c.provider">
                  <img v-if="providerIconUrl(c.provider)" class="provider-badge-icon" :src="providerIconUrl(c.provider)" alt="" />
                  <template v-else>{{ c.provider.slice(0, 1).toUpperCase() }}</template>
                </div>
                <div class="config-main">
                  <div class="config-line">
                    <span class="config-name">{{ c.name || `${c.provider}-${c.service_type}` }}</span>
                    <span :class="['tag', c.api_key ? 'tag-success' : 'tag-error']">{{ c.api_key ? t('settings.ai.hasKey') : t('settings.ai.noKey') }}</span>
                    <span v-if="!c.is_active" class="tag">{{ t('settings.common.disabled') }}</span>
                  </div>
                  <div class="config-models">
                    <button
                      v-for="m in c.model" :key="m" type="button"
                      :class="['cfg-model-chip mono', { 'is-default': isDefaultModel(st.type, c, m) }]"
                      :title="isDefaultModel(st.type, c, m) ? t('settings.ai.currentDefault') : t('settings.ai.setDefault')"
                      @click="setDefaultModel(st.type, c, m)"
                    >
                      <Star v-if="isDefaultModel(st.type, c, m)" :size="9" class="cfg-model-star" />
                      {{ m }}
                    </button>
                  </div>
                  <div class="config-sub mono truncate">{{ c.base_url || t('settings.ai.noBaseUrl') }}</div>
                </div>
                <button v-if="st.type === 'text'" class="btn btn-ghost btn-sm" @click="testExistingCfg(c)">{{ t('settings.ai.test') }}</button>
                <label class="config-switch">
                  <input type="checkbox" class="sr-only" :checked="c.is_active" @change="toggleCfg(c)">
                  <span class="switch" :class="{ on: c.is_active }"></span>
                </label>
                <button class="btn btn-ghost btn-icon btn-sm" @click="startEditCfg(c)"><Pencil :size="13" /></button>
                <button class="btn btn-danger btn-icon btn-sm" @click="delCfg(c.id)"><Trash2 :size="13" /></button>
              </div>
              <p v-if="!byType(st.type).length" class="config-empty">{{ t('settings.common.empty') }}</p>
            </section>
          </div>
        </div>

        <!-- ===== 风格预设 ===== -->
        <div v-else-if="tab === 'styles'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">{{ t('settings.styles.title') }}</h2>
            <p class="settings-desc">{{ t('settings.styles.desc') }}</p>
          </div>
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">{{ t('settings.styles.allTitle') }}</span>
                <div class="svc-group-sub">{{ t('settings.styles.count', { active: stylePresets.filter(p => p.is_active).length, total: stylePresets.length }) }}</div>
              </div>
              <button class="btn btn-ghost btn-sm ml-auto" @click="startAddStyle"><Plus :size="13" /> {{ t('common.add') }}</button>
            </div>
            <div v-for="p in stylePresets" :key="p.id" class="config-row">
              <div class="provider-badge style-badge"><Palette :size="15" /></div>
              <div class="config-main">
                <div class="config-line">
                  <span class="config-name">{{ styleName(p) }}</span>
                  <span class="tag mono">{{ p.value }}</span>
                  <span v-if="!p.is_active" class="tag">{{ t('settings.common.disabled') }}</span>
                </div>
                <div class="config-sub mono truncate">{{ p.prompt }}</div>
                <div v-if="styleDesc(p)" class="config-sub truncate">{{ styleDesc(p) }}</div>
              </div>
              <label class="config-switch">
                <input type="checkbox" class="sr-only" :checked="p.is_active" @change="toggleStyle(p)">
                <span class="switch" :class="{ on: p.is_active }"></span>
              </label>
              <button class="btn btn-ghost btn-icon btn-sm" @click="startEditStyle(p)"><Pencil :size="13" /></button>
              <button class="btn btn-danger btn-icon btn-sm" @click="styleToDelete = p"><Trash2 :size="13" /></button>
            </div>
            <p v-if="!stylePresets.length" class="config-empty">{{ t('settings.styles.empty') }}</p>
          </section>
        </div>

        <!-- ===== 存储位置 ===== -->
        <div v-else-if="tab === 'storage'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">{{ t('settings.storage.title') }}</h2>
            <p class="settings-desc">{{ t('settings.storage.desc') }}</p>
          </div>
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">{{ t('settings.storage.currentDir') }}</span>
                <div v-if="storageInfo?.computedAt" class="svc-group-sub">{{ t('settings.storage.computedAt', { time: new Date(storageInfo.computedAt).toLocaleString() }) }}</div>
              </div>
              <button v-if="isDesktopMode" class="btn btn-primary btn-sm ml-auto" :disabled="migrating" @click="pickTarget">
                <HardDrive :size="13" /> {{ t('settings.storage.changeLocation') }}
              </button>
            </div>
            <div class="config-row">
              <div class="provider-badge style-badge"><HardDrive :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.storage.dataDir') }}</span><span class="tag mono">{{ storageInfo?.mode === 'desktop' ? t('settings.storage.desktopMode') : t('settings.storage.serverMode') }}</span></div>
                <div class="config-sub mono truncate">{{ storageInfo?.dataDir || t('common.loading') }}</div>
                <div class="config-sub mono truncate">{{ storageInfo?.sqlitePath || '' }}</div>
              </div>
            </div>
            <div v-if="storageInfo?.usage" class="config-row">
              <div class="provider-badge style-badge"><Database :size="15" /></div>
              <div class="config-main">
                <div class="config-line">
                  <span class="config-name">{{ t('settings.storage.totalUsage', { size: formatBytes(storageInfo.usage.total) }) }}</span>
                  <span v-if="storageInfo.usageStale" class="tag">{{ t('settings.storage.counting') }}</span>
                </div>
                <div class="storage-breakdown">
                  <span class="tag mono">{{ t('settings.storage.breakdown.db') }} {{ formatBytes(storageInfo.usage.db) }}</span>
                  <span class="tag mono">{{ t('settings.storage.breakdown.images') }} {{ formatBytes(storageInfo.usage.images) }}</span>
                  <span class="tag mono">{{ t('settings.storage.breakdown.videos') }} {{ formatBytes(storageInfo.usage.videos) }}</span>
                  <span class="tag mono">{{ t('settings.storage.breakdown.merged') }} {{ formatBytes(storageInfo.usage.merged) }}</span>
                  <span class="tag mono">{{ t('settings.storage.breakdown.uploads') }} {{ formatBytes(storageInfo.usage.uploads) }}</span>
                  <span v-if="storageInfo.usage.temp" class="tag mono">{{ t('settings.storage.breakdown.temp') }} {{ formatBytes(storageInfo.usage.temp) }}</span>
                  <span v-if="storageInfo.usage.other" class="tag mono">{{ t('settings.storage.breakdown.other') }} {{ formatBytes(storageInfo.usage.other) }}</span>
                </div>
                <div v-if="storageInfo.freeBytes != null" class="config-sub">{{ t('settings.storage.diskFree', { size: formatBytes(storageInfo.freeBytes) }) }}</div>
              </div>
            </div>
            <p class="config-empty">{{ t('settings.storage.note') }}</p>
            <p v-if="!isDesktopMode" class="config-empty">{{ t('settings.storage.serverNote') }}</p>
          </section>
        </div>

        <!-- ===== 关于更新 ===== -->
        <div v-else-if="tab === 'about'" class="settings-scroll">
          <div class="settings-head">
            <h2 class="settings-title">{{ t('settings.about.title') }}</h2>
            <p class="settings-desc">{{ t('settings.about.desc') }}</p>
          </div>
          <section class="card svc-group">
            <div class="svc-group-head">
              <div class="svc-group-heading">
                <span class="svc-group-title">{{ t('settings.about.currentVersion', { v: updateState?.currentVersion || '…' }) }}</span>
                <div v-if="updateState?.latestVersion" class="svc-group-sub">{{ t('settings.about.latestVersion', { v: updateState.latestVersion }) }}</div>
              </div>
              <button class="btn btn-primary btn-sm ml-auto" :disabled="updateChecking" @click="checkUpdate">
                <Loader2 v-if="updateChecking" :size="13" class="animate-spin" />
                <RefreshCw v-else :size="13" />
                {{ t('settings.about.check') }}
              </button>
            </div>

            <div v-if="updateState?.status === 'up-to-date'" class="config-row">
              <div class="provider-badge style-badge"><Check :size="15" /></div>
              <div class="config-main"><div class="config-line"><span class="config-name">{{ t('settings.about.upToDate') }}</span></div></div>
            </div>
            <div v-else-if="updateState?.status === 'available' || updateState?.status === 'downloading'" class="config-row">
              <div class="provider-badge style-badge"><Sparkles :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.about.found', { v: updateState.latestVersion }) }}</span></div>
                <div v-if="updateState.notes" class="config-sub">{{ updateState.notes }}</div>
                <div v-if="updateState.status === 'downloading' || updateDownloading" class="update-bar">
                  <div class="update-bar-fill" :style="{ width: `${updateProgress}%` }"></div>
                </div>
                <!-- 服务器手动模式：无 Watchtower，给出更新命令 -->
                <div v-if="!desktopBridge && serverUpdateMode === 'manual'" class="config-sub">
                  {{ t('settings.about.serverManualHint') }} <span class="mono">docker compose pull && docker compose up -d</span>
                </div>
              </div>
              <!-- 桌面版：下载更新包 -->
              <button v-if="desktopBridge" class="btn btn-primary btn-sm" :disabled="updateDownloading" @click="downloadUpdate">
                <Loader2 v-if="updateDownloading" :size="13" class="animate-spin" />
                <Download v-else :size="13" />
                {{ updateDownloading ? t('settings.about.downloading', { p: updateProgress }) : t('settings.about.download') }}
              </button>
              <!-- 服务器 + Watchtower：一键触发拉镜像重建 -->
              <button v-else-if="serverUpdateMode === 'watchtower'" class="btn btn-primary btn-sm" :disabled="updateApplying" @click="applyUpdate">
                <Loader2 v-if="updateApplying" :size="13" class="animate-spin" />
                <Download v-else :size="13" />
                {{ t('settings.about.serverApply') }}
              </button>
            </div>
            <div v-else-if="updateState?.status === 'downloaded'" class="config-row">
              <div class="provider-badge style-badge"><Download :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.about.ready') }}</span></div>
                <div class="config-sub">{{ t('settings.about.readyDesc') }}</div>
              </div>
              <button class="btn btn-primary btn-sm" :disabled="updateApplying" @click="applyUpdate">
                <Loader2 v-if="updateApplying" :size="13" class="animate-spin" />
                {{ t('settings.about.restartInstall') }}
              </button>
            </div>
            <div v-else-if="updateState?.status === 'error'" class="config-row">
              <div class="provider-badge style-badge"><RefreshCw :size="15" /></div>
              <div class="config-main">
                <div class="config-line"><span class="config-name">{{ t('settings.about.checkFailed') }}</span></div>
                <div class="config-sub">{{ updateState.error }}</div>
              </div>
              <button class="btn btn-ghost btn-sm" @click="checkUpdate">{{ t('settings.about.retry') }}</button>
            </div>
            <p v-else class="config-empty">{{ t('settings.about.empty') }}</p>
          </section>
          <p v-if="desktopBridge" class="config-empty">{{ t('settings.about.note') }}</p>
          <p v-else class="config-empty">{{ t('settings.about.serverNote') }}</p>
        </div>

        <!-- ===== Agent 配置（左侧 tab 切换，Prompt 与 Skills 整合在同一 Agent 下） ===== -->
        <div v-else-if="tab === 'agents'" class="skills-layout">
          <!-- Agent 左侧 tab 列表 -->
          <aside class="skills-agent-list">
            <div class="skills-agent-title">{{ t('settings.skills.agentList') }}</div>
            <button
              v-for="a in agentDefs"
              :key="a.type"
              :class="['skills-agent-item', { active: selectedAgent === a.type }]"
              @click="selectAgent(a.type)"
            >
              <span class="agent-type-badge">{{ a.icon }}</span>
              <span class="skills-agent-label">{{ a.label }}</span>
              <span v-if="agentSkillCount(a.type) > 0" class="skill-count-badge">{{ agentSkillCount(a.type) }}</span>
            </button>
          </aside>

          <!-- 右侧主区域 -->
          <div class="settings-scroll skills-main">
            <div class="settings-head skills-head">
              <span class="agent-type-badge skills-head-badge">{{ selectedAgentIcon }}</span>
              <div class="skills-head-copy">
                <h2 class="settings-title">{{ selectedAgentLabel }}</h2>
                <div class="dim" style="font-size:12px;margin-top:2px;display:flex;align-items:center;gap:6px">
                  {{ selectedAgentType }}
                  <span v-if="getAgentCfg(selectedAgent) && !getAgentCfg(selectedAgent).is_default" class="tag tag-success">{{ t('settings.common.custom') }}</span>
                  <span v-else class="tag">{{ t('common.default') }}</span>
                </div>
              </div>
              <button v-if="agentPane === 'skills'" class="btn btn-primary btn-sm ml-auto" @click="startAddSkill">
                <Plus :size="13" /> {{ t('settings.skills.add') }}
              </button>
            </div>

            <!-- Prompt 面板（子 tab 作为卡片头，与卡片同宽对齐） -->
            <div v-if="agentPane === 'prompt'" class="card agent-card">
              <div class="agent-pane-tabs">
                <div class="agent-pane-tabs-nav">
                  <button :class="['agent-pane-tab', { active: agentPane === 'prompt' }]" @click="agentPane = 'prompt'">System Prompt</button>
                  <button :class="['agent-pane-tab', { active: agentPane === 'skills' }]" @click="agentPane = 'skills'">
                    Skills<template v-if="agentSkillCount(selectedAgent) > 0"> ({{ agentSkillCount(selectedAgent) }})</template>
                  </button>
                </div>
                <span class="agent-lang-follow dim">
                  {{ t('settings.agents.followContentLang', { lang: contentLangLabel }) }}
                </span>
              </div>
              <div class="agent-card-body">
                <label class="field">
                  <span class="field-label">System Prompt <span class="dim">({{ t('settings.agents.promptHint', { file: promptFileName }) }})</span>
                    <span v-if="agentPromptFallback" class="tag agent-fallback-tag">{{ t('settings.agents.langFallback') }}</span>
                  </span>
                  <textarea v-model="agentForm.system_prompt" class="textarea agent-prompt-input" rows="16" :placeholder="t('settings.agents.promptPlaceholder')" />
                </label>
                <div class="agent-card-foot">
                  <button class="btn btn-ghost btn-sm" @click="resetAgentPrompt(selectedAgent)">{{ t('settings.agents.reset') }}</button>
                  <span v-if="agentSaved === selectedAgent" class="tag tag-success" style="margin-left:8px">
                    <Check :size="10" /> {{ t('common.saved') }}
                  </span>
                  <button class="btn btn-primary btn-sm ml-auto" :disabled="agentSaving" @click="saveAgentCfg(selectedAgent)">
                    <Loader2 v-if="agentSaving" :size="12" class="animate-spin" />
                    {{ t('common.save') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- Skills 面板（子 tab 同为卡片头） -->
            <template v-else>
              <div class="agent-pane-tabs-wrap card">
                <div class="agent-pane-tabs">
                  <div class="agent-pane-tabs-nav">
                    <button :class="['agent-pane-tab', { active: agentPane === 'prompt' }]" @click="agentPane = 'prompt'">System Prompt</button>
                    <button :class="['agent-pane-tab', { active: agentPane === 'skills' }]" @click="agentPane = 'skills'">
                      Skills<template v-if="agentSkillCount(selectedAgent) > 0"> ({{ agentSkillCount(selectedAgent) }})</template>
                    </button>
                  </div>
                  <span class="agent-lang-follow dim">
                    {{ t('settings.agents.followContentLang', { lang: contentLangLabel }) }}
                  </span>
                </div>
              </div>
              <p class="settings-desc" style="margin-top:0">{{ t('settings.skills.desc') }}</p>

              <!-- 无 skill 提示 -->
              <div v-if="!currentSkills.length" class="card skills-empty">
                <div class="skills-empty-icon">
                  <FileText :size="24" />
                </div>
                <div class="skills-empty-title">{{ t('settings.skills.emptyTitle') }}</div>
                <div class="skills-empty-desc">{{ t('settings.skills.emptyDesc') }}</div>
              </div>

              <!-- Skill 列表 -->
              <div class="skill-list" v-else>
                <div v-for="s in currentSkills" :key="s.id" class="card skill-card">
                  <div class="skill-card-head" @click="toggleSkillEdit(s.id)">
                    <FileText :size="14" style="color:var(--accent);flex-shrink:0" />
                    <div style="flex:1;min-width:0">
                      <div style="font-weight:600;font-size:13px">{{ s.name }}</div>
                      <div class="dim" style="font-size:11px">{{ s.description }}</div>
                    </div>
                    <button class="btn btn-danger btn-icon btn-sm" style="margin-right:4px" @click.stop="skillToDelete = s.id">
                      <Trash2 :size="13" />
                    </button>
                    <ChevronDown :size="14" :style="{ transform: editingSkill === s.id ? 'rotate(180deg)' : '', transition: '0.2s' }" />
                  </div>
                  <div v-if="editingSkill === s.id" class="skill-card-body">
                    <textarea
                      v-model="skillContent"
                      class="textarea mono skill-content-input"
                      rows="20"
                      style="font-size:12px;line-height:1.6"
                      :placeholder="t('settings.skills.contentPlaceholder')"
                    />
                    <div class="skill-card-foot">
                      <span class="dim" style="font-size:11px">skills/{{ s.id }}/{{ skillFileName }}</span>
                      <span v-if="skillContentFallback" class="tag agent-fallback-tag">{{ t('settings.agents.langFallback') }}</span>
                      <span v-if="skillSaved === s.id" class="tag tag-success" style="margin-left:8px">
                        <Check :size="10" /> {{ t('common.saved') }}
                      </span>
                      <button class="btn btn-primary btn-sm ml-auto" :disabled="skillSaving" @click="saveSkill(s.id)">
                        <Loader2 v-if="skillSaving" :size="12" class="animate-spin" />
                        {{ t('common.save') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- AI Config Dialog -->
    <div v-if="cfgDialog" class="overlay" @click.self="cfgDialog = false">
      <form class="dialog config-dialog" @submit.prevent="saveCfg">
        <div class="dialog-head">
          <div>
            <div class="dialog-title">{{ cfgEditId ? t('settings.cfg.editTitle') : t('settings.cfg.addTitle', { type: serviceMeta[cfgForm.service_type].label }) }}</div>
            <div class="dialog-sub">{{ t('settings.cfg.sub') }}</div>
          </div>
          <span class="tag tag-accent ml-auto">{{ serviceMeta[cfgForm.service_type].label }}</span>
        </div>
        <div class="dialog-body config-dialog-body">
          <div class="preset-picker">
            <button
              v-for="preset in presetsByType(cfgForm.service_type)"
              :key="`${cfgForm.service_type}-${preset.provider}`"
              type="button"
              class="preset-pill"
              @click="applyProviderPreset(cfgForm.service_type, preset.provider)"
            >
              {{ preset.label }}
            </button>
          </div>
          <label class="field">
            <span class="field-label">{{ t('settings.cfg.name') }}</span>
            <input v-model="cfgForm.name" class="input" :placeholder="t('settings.cfg.namePlaceholder')" />
          </label>
          <label class="field"><span class="field-label">{{ t('settings.cfg.provider') }}</span>
            <BaseSelect v-model="cfgForm.provider" :options="providerSelectOptions" :placeholder="t('settings.cfg.providerPlaceholder')" searchable />
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.cfg.priority') }}</span>
            <input v-model.number="cfgForm.priority" class="input" type="number" min="0" max="999" />
            <span class="field-hint">{{ t('settings.cfg.priorityHint') }}</span>
          </label>
          <label class="field"><span class="field-label">API Key</span><input v-model="cfgForm.api_key" class="input" type="password" placeholder="sk-..." /></label>
          <label class="field"><span class="field-label">Base URL</span><input v-model="cfgForm.base_url" class="input" placeholder="https://..." /></label>
          <div class="field">
            <span class="field-label">{{ t('settings.cfg.models') }}</span>
            <div v-if="cfgForm.models.length" class="model-chips">
              <span
                v-for="(m, i) in cfgForm.models" :key="`${m}-${i}`"
                :class="['model-chip', { 'is-default': i === 0 }]"
                :title="t('settings.cfg.modelChipHint')"
                @click="pinModelTop(i)"
              >
                {{ m }}<em v-if="i === 0">{{ t('common.default') }}</em>
                <button type="button" class="model-chip-x" :title="t('common.delete')" @click.stop="removeModel(i)"><X :size="11" /></button>
              </span>
            </div>
            <div class="model-add-row">
              <input
                v-model="modelInput" class="input" :placeholder="t('settings.cfg.modelPlaceholder')"
                @keydown.enter.prevent="addModel"
                @paste="onModelPaste"
              />
              <button type="button" class="btn btn-sm" :disabled="!modelInput.trim()" @click="addModel">{{ t('common.add') }}</button>
            </div>
            <span class="field-hint">{{ t('settings.cfg.modelsHint') }}</span>
          </div>
          <label v-if="cfgForm.service_type === 'text'" class="field">
            <span class="field-label">Temperature <span class="dim">({{ t('settings.cfg.tempHint') }})</span></span>
            <input v-model="cfgForm.temperature" class="input" type="number" step="0.1" min="0" max="2" :placeholder="t('settings.cfg.tempPlaceholder')" />
            <span class="field-hint">{{ t('settings.cfg.tempNote') }}</span>
          </label>
          <div v-if="cfgTestResult" class="test-result" :class="{ ok: cfgTestResult.reachable, bad: !cfgTestResult.reachable }">
            <div class="test-result-head">
              <span class="tag" :class="cfgTestResult.reachable ? 'tag-success' : 'tag-error'">{{ cfgTestResult.status || 'ERROR' }}</span>
              <span>{{ cfgTestResult.message }}</span>
            </div>
            <div class="mono test-result-url">{{ cfgTestResult.method }} {{ cfgTestResult.url }}</div>
            <div v-if="cfgTestResult.response_preview" class="mono test-result-preview">{{ cfgTestResult.response_preview }}</div>
          </div>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-ghost test-draft-btn" :disabled="cfgTesting" @click="testDraftCfg">
            <Loader2 v-if="cfgTesting" :size="12" class="animate-spin" />
            <span v-else>{{ t('settings.cfg.test') }}</span>
          </button>
          <button type="button" class="btn" @click="cfgDialog = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary">{{ t('common.save') }}</button>
        </div>
      </form>
    </div>

    <!-- Add Skill Dialog -->
    <div v-if="addSkillDialog" class="overlay" @click.self="addSkillDialog = false">
      <form class="dialog skill-dialog" @submit.prevent="confirmAddSkill">
        <div class="dialog-head">
          <div class="dialog-title">{{ t('settings.skills.addTitle', { agent: selectedAgentLabel }) }}</div>
        </div>
        <div class="dialog-body skill-dialog-body">
          <label class="field">
            <span class="field-label">{{ t('settings.skills.dirName') }} <span class="dim">({{ t('settings.skills.dirNameHint') }})</span></span>
            <input v-model="newSkillForm.id" class="input" :placeholder="t('settings.skills.dirNamePlaceholder')" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.skills.name') }}</span>
            <input v-model="newSkillForm.name" class="input" :placeholder="t('settings.skills.namePlaceholder')" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.skills.description') }}</span>
            <input v-model="newSkillForm.description" class="input" :placeholder="t('settings.skills.descPlaceholder')" />
          </label>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn" @click="addSkillDialog = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="!newSkillForm.id">{{ t('settings.skills.create') }}</button>
        </div>
      </form>
    </div>

    <!-- Style Preset Dialog -->
    <div v-if="styleDialog" class="overlay" @click.self="styleDialog = false">
      <form class="dialog config-dialog" @submit.prevent="saveStyle">
        <div class="dialog-head">
          <div>
            <div class="dialog-title">{{ styleEditId ? t('settings.styleDialog.editTitle') : t('settings.styleDialog.addTitle') }}</div>
            <div class="dialog-sub">{{ t('settings.styleDialog.sub') }}</div>
          </div>
          <span class="tag tag-accent ml-auto"><Palette :size="12" /> {{ t('settings.styleDialog.tag') }}</span>
        </div>
        <div class="dialog-body config-dialog-body">
          <label class="field">
            <span class="field-label">{{ t('settings.styleDialog.name') }} <span class="required">*</span></span>
            <input v-model="styleForm.name" class="input" :placeholder="t('settings.styleDialog.namePlaceholder')" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.styleDialog.key') }} <span class="required">*</span></span>
            <input v-model="styleForm.value" class="input mono" :placeholder="t('settings.styleDialog.keyPlaceholder')" :disabled="!!styleEditId" />
            <span class="field-hint">{{ t('settings.styleDialog.keyHint') }}</span>
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.styleDialog.prompt') }} <span class="required">*</span></span>
            <textarea v-model="styleForm.prompt" class="textarea" rows="3" :placeholder="t('settings.styleDialog.promptPlaceholder')"></textarea>
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.styleDialog.description') }}</span>
            <input v-model="styleForm.description" class="input" :placeholder="t('settings.styleDialog.descPlaceholder')" />
          </label>
          <label class="field">
            <span class="field-label">{{ t('settings.styleDialog.sort') }}</span>
            <input v-model.number="styleForm.sort_order" class="input" type="number" min="0" max="999" />
          </label>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn" @click="styleDialog = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary">{{ t('common.save') }}</button>
        </div>
      </form>
    </div>
    <!-- 迁移确认（自建 dialog：ConfirmDialog 的删除语义/Enter 快捷键不合此处） -->
    <div v-if="migrateDialog" class="overlay" @click.self="!migrating && (migrateDialog = false)">
      <form class="dialog" @submit.prevent="startMigrate">
        <div class="dialog-head"><span class="dialog-title">{{ t('settings.migrate.title') }}</span></div>
        <div class="dialog-body">
          <div class="field">
            <span class="field-label">{{ t('settings.migrate.newDir') }}</span>
            <div class="input mono" style="word-break: break-all">{{ migrateTarget }}</div>
          </div>
          <div class="field">
            <span class="field-label">{{ t('settings.migrate.dataToMove') }}</span>
            <div class="field-hint">
              {{ t('settings.migrate.sizeNote', { size: formatBytes(storageInfo?.usage?.total || 0) }) }}<template v-if="migrateTargetFree != null">{{ t('settings.migrate.freeNote', { size: formatBytes(migrateTargetFree) }) }}</template>
            </div>
          </div>
          <label class="field" style="display:flex; align-items:center; gap:8px; cursor:pointer">
            <input v-model="migrateFiles" type="checkbox" :disabled="migrating" />
            <span class="field-label" style="margin:0">{{ t('settings.migrate.moveFiles') }}</span>
          </label>
          <p v-if="!migrateFiles" class="field-hint migrate-warn">{{ t('settings.migrate.emptyWarn') }}</p>
          <p class="field-hint">{{ t('settings.migrate.note') }}</p>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn" :disabled="migrating" @click="migrateDialog = false">{{ t('common.cancel') }}</button>
          <button type="submit" class="btn btn-primary" :disabled="migrating">
            <Loader2 v-if="migrating" :size="12" class="animate-spin" />
            {{ t('settings.migrate.start') }}
          </button>
        </div>
      </form>
    </div>
    <ConfirmDialog
      :open="!!styleToDelete"
      :title="t('settings.styleDelete.title')"
      :message="t('settings.styleDelete.message', { name: styleToDelete?.name })"
      :loading="deletingStyle"
      @confirm="confirmDelStyle"
      @cancel="styleToDelete = null"
    />
    <ConfirmDialog
      :open="!!skillToDelete"
      :title="t('settings.skillDelete.title')"
      :message="t('settings.skillDelete.message', { id: skillToDelete })"
      :loading="deletingSkill"
      @confirm="confirmDelSkill"
      @cancel="skillToDelete = null"
    />
    <!-- Flow Cookie Import Dialog -->
    <div v-if="showFlowImportModal" class="overlay" @click.self="showFlowImportModal = false">
      <div class="dialog" style="max-width: 600px; width: 95%;">
        <div class="dialog-head">
          <div>
            <div class="dialog-title">{{ t('settings.ai.flowImportTitle') }}</div>
            <div class="dialog-sub">{{ t('settings.ai.flowImportDesc') }}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs ml-auto" @click="showFlowImportModal = false">
            <X :size="14" />
          </button>
        </div>
        <div class="dialog-body">
          <div class="field mb-2">
            <label class="field-label">JSON Session Data</label>
            <textarea
              v-model="flowImportJson"
              class="input font-mono text-xs"
              rows="12"
              :placeholder="t('settings.ai.flowImportPlaceholder')"
              style="line-height: 1.4; resize: vertical; width: 100%; white-space: pre;"
            ></textarea>
            <p class="text-xs text-muted mt-1.5" style="font-size: 11px; opacity: 0.85;">
              💡 รองรับ Session JSON จาก Chrome DevTools / Cookie Editor (มี <code>project_id</code>, <code>cookies</code>, <code>at</code>, <code>fsid</code>)
            </p>
          </div>
        </div>
        <div class="dialog-foot">
          <button type="button" class="btn btn-ghost" :disabled="flowImporting" @click="showFlowImportModal = false">
            {{ t('common.cancel') }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="flowImporting || !flowImportJson.trim()"
            @click="handleImportFlowAccount"
          >
            <Loader2 v-if="flowImporting" :size="13" class="animate-spin" />
            <Check v-else :size="13" />
            {{ t('settings.ai.flowImportSubmit') }}
          </button>
        </div>
      </div>
    </div>

    <!-- Flow Account Delete Confirm Dialog -->
    <ConfirmDialog
      :open="!!flowAccountToDelete"
      :title="t('settings.ai.flowDeleteConfirm')"
      :message="flowAccountToDelete ? `ID: ${flowAccountToDelete.id} (${flowAccountToDelete.project_id || flowAccountToDelete.filename})` : ''"
      :loading="flowDeleting"
      @confirm="confirmDeleteFlowAccount"
      @cancel="flowAccountToDelete = null"
    />
  </div>
</template>

<script setup>
import { Plus, Pencil, Trash2, FileText, ChevronDown, Check, Loader2, Bot, Cpu, Sparkles, Palette, ExternalLink, Star, HardDrive, Database, RefreshCw, Download, Languages, SunMoon, X, Layers } from 'lucide-vue-next'
import BaseSelect from '~/components/BaseSelect.vue'
import { toast } from 'vue-sonner'
import { toastError } from '~/composables/useToast'
import { useI18n } from 'vue-i18n'
import { aiConfigAPI, flowBridgeAPI, promptAPI, skillsAPI, storageAPI, stylePresetAPI, settingsAPI, serverUpdateAPI } from '~/composables/useApi'
import { useDesktopBridge } from '~/composables/useDesktopBridge'
import { useMigrateState } from '~/composables/useMigrateState'
import { useTheme } from '~/composables/useTheme'
import { providerIconUrl } from '~/composables/useProviderIcon'
import { startTour, autoTour } from '~/composables/useTour'
import { confirmUnifiedLanguage } from '~/composables/useUnifiedLanguage'

const { t, te, locale } = useI18n()

const showBrandImage = ref(true)
const tab = ref('ai')
const baseTabs = computed(() => [
  { id: 'ai', label: t('settings.tabs.ai'), icon: Cpu },
  { id: 'general', label: t('settings.tabs.general'), icon: Languages },
  { id: 'styles', label: t('settings.tabs.styles'), icon: Palette },
  { id: 'agents', label: t('settings.tabs.agents'), icon: Bot },
  { id: 'storage', label: t('settings.tabs.storage'), icon: HardDrive },
  { id: 'about', label: t('settings.tabs.about'), icon: RefreshCw },
])

// ===== AI Service Configs =====
const cfgs = ref([])
const cfgDialog = ref(false)
const cfgEditId = ref(null)
const cfgTesting = ref(false)
const cfgTestResult = ref(null)
const quickProviderTab = ref('flow')
const flowStatus = ref(null)
const flowChecking = ref(false)
const flowSaving = ref(false)
const flowAccounts = ref([])
const flowSwitchingId = ref(null)
const showFlowImportModal = ref(false)
const flowImportJson = ref('')
const flowImporting = ref(false)
const flowAccountToDelete = ref(null)
const flowDeleting = ref(false)
const antigravitySaving = ref(false)
const antigravityStatus = ref(null)
const antigravityChecking = ref(false)
const geminiApiKey = ref('')
const geminiSaving = ref(false)
const openaiApiKey = ref('')
const openaiSaving = ref(false)
const huobaoApiKey = ref('')
const huobaoSaving = ref(false)
// 火宝节点选择：默认跟随界面语言（中文→国内 .cn，其他→国外 .com），一键配置与取 Key 链接共用
const huobaoRegion = ref(locale.value?.startsWith('zh') ? 'cn' : 'com')
const huobaoSiteUrl = computed(() => `https://api.firemux.${huobaoRegion.value}`)
const cfgForm = reactive({ name: '', provider: '', api_key: '', base_url: '', models: [], service_type: 'text', priority: 0, temperature: '' })
// 模型标签编辑器：首位即默认模型；输入框支持回车添加、逗号/换行批量粘贴
const modelInput = ref('')
function addModel() {
  const names = modelInput.value.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
  for (const n of names) if (!cfgForm.models.includes(n)) cfgForm.models.push(n)
  modelInput.value = ''
}
function onModelPaste(e) {
  const text = e.clipboardData?.getData('text') || ''
  if (!/[,，\n]/.test(text)) return // 单模型走默认粘贴
  e.preventDefault()
  for (const n of text.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)) {
    if (!cfgForm.models.includes(n)) cfgForm.models.push(n)
  }
}
function removeModel(i) { cfgForm.models.splice(i, 1) }
function pinModelTop(i) {
  if (i <= 0) return
  const [m] = cfgForm.models.splice(i, 1)
  cfgForm.models.unshift(m)
}
// 服务类型 label/desc 渲染时求值（语言切换即时生效），type 为逻辑值
const serviceTypes = computed(() => [
  { type: 'text', label: t('common.serviceType.text') },
  { type: 'image', label: t('common.serviceType.image') },
  { type: 'video', label: t('common.serviceType.video') },
])
const providers = ['antigravity', 'gemini', 'openai', 'google_flow', 'volcengine', 'minimax', 'aliyun']
const providerSelectOptions = computed(() => providers.map(p => ({ label: p, value: p })))
const serviceMeta = computed(() => ({
  text: { label: t('common.serviceType.text'), desc: t('settings.ai.meta.text') },
  image: { label: t('common.serviceType.image'), desc: t('settings.ai.meta.image') },
  video: { label: t('common.serviceType.video'), desc: t('settings.ai.meta.video') },
}))
const providerPresets = computed(() => ({
  text: {
    antigravity: { label: t('settings.ai.presets.antigravityOfficial'), baseUrl: 'http://127.0.0.1:8317', models: ['gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3.1-flash-lite', 'gemini-pro-agent', 'claude-sonnet-4-6'] },
    gemini: { label: t('settings.ai.presets.geminiOfficial'), baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'] },
    openai: { label: t('settings.ai.presets.openaiOfficial'), baseUrl: 'https://api.openai.com', models: ['gpt-4o', 'gpt-4o-mini'] },
  },
  image: {
    google_flow: { label: t('settings.ai.presets.flowOfficial'), baseUrl: 'http://127.0.0.1:5679/api/v1/flow-bridge', models: ['gem_pix_2', 'narwhal'] },
    gemini: { label: t('settings.ai.presets.geminiOfficial'), baseUrl: 'https://generativelanguage.googleapis.com', models: ['gemini-3-pro-image', 'imagen-3.0-generate-002'] },
    openai: { label: t('settings.ai.presets.openaiOfficial'), baseUrl: 'https://api.openai.com', models: ['dall-e-3', 'gpt-image-2'] },
  },
  video: {
    google_flow: { label: t('settings.ai.presets.flowOfficial'), baseUrl: 'http://127.0.0.1:5679/api/v1/flow-bridge', models: ['veo-4s-360p', 'veo-8s-720p', 'veo'] },
    aliyun: { label: t('settings.ai.presets.aliyunWan'), baseUrl: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com', models: ['wan3.0-video', 'wan3.0-video-prime'] },
    volcengine: { label: t('settings.ai.presets.seedanceOfficial'), baseUrl: 'https://ark.cn-beijing.volces.com', models: ['doubao-seedance-2-0-mini-260615', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128'] },
    minimax: { label: t('settings.ai.presets.minimaxOfficial'), baseUrl: 'https://api.minimaxi.com', models: ['MiniMax-H3'] },
  },
}))

const flowQuickConfigs = computed(() => [
  { service_type: 'image', provider: 'google_flow', name: 'Google Flow Image (Imagen 3)', base_url: 'http://127.0.0.1:5679/api/v1/flow-bridge', model: ['gem_pix_2', 'narwhal'], priority: 150 },
  { service_type: 'video', provider: 'google_flow', name: 'Google Flow Video (Veo)', base_url: 'http://127.0.0.1:5679/api/v1/flow-bridge', model: ['veo-4s-360p', 'veo-8s-720p', 'veo'], priority: 150 },
])

const flowProxyQuickConfigs = computed(() => [
  { service_type: 'image', provider: 'openai', name: 'Google Flow (OpenAI Proxy)', base_url: 'http://127.0.0.1:5679/api/v1/flow-bridge', model: ['gem_pix_2', 'narwhal'], priority: 140 },
  { service_type: 'video', provider: 'google_flow', name: 'Google Flow Video (Veo)', base_url: 'http://127.0.0.1:5679/api/v1/flow-bridge', model: ['veo-4s-360p', 'veo-8s-720p', 'veo'], priority: 140 },
])

const antigravityQuickConfigs = computed(() => [
  { service_type: 'text', provider: 'antigravity', name: 'Google Antigravity (Gemini ฟรี)', base_url: 'http://127.0.0.1:8317', model: ['gemini-3.8-flash-high', 'gemini-3.7-flash-high', 'gemini-3.6-flash-high', 'gemini-3.1-flash-lite', 'gemini-pro-agent', 'claude-sonnet-4-6'], priority: 150 },
])

const geminiQuickConfigs = computed(() => [
  { service_type: 'text', provider: 'gemini', name: 'Google Gemini (ทางการ)', base_url: 'https://generativelanguage.googleapis.com', model: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'], priority: 102 },
  { service_type: 'image', provider: 'gemini', name: 'Google Gemini Image (ทางการ)', base_url: 'https://generativelanguage.googleapis.com', model: ['gemini-3-pro-image', 'imagen-3.0-generate-002'], priority: 102 },
])

const openaiQuickConfigs = computed(() => [
  { service_type: 'text', provider: 'openai', name: 'OpenAI (ทางการ)', base_url: 'https://api.openai.com', model: ['gpt-4o', 'gpt-4o-mini'], priority: 101 },
  { service_type: 'image', provider: 'openai', name: 'OpenAI DALL-E (ทางการ)', base_url: 'https://api.openai.com', model: ['dall-e-3', 'gpt-image-2'], priority: 101 },
])
const huobaoQuickConfigs = computed(() => {
  const base = huobaoSiteUrl.value
  return [
    { service_type: 'text', provider: 'gemini', name: `${t('settings.ai.quickServiceText')} · Gemini`, base_url: base, model: ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview'], priority: 101 },
    { service_type: 'text', provider: 'openai', name: `${t('settings.ai.quickServiceText')} · OpenAI`, base_url: base, model: ['deepseek-v4-pro', 'deepseek-v4-flash', 'gpt-5.6-terra'], priority: 100 },
    { service_type: 'image', provider: 'openai', name: `${t('settings.ai.quickServiceImage')} · OpenAI`, base_url: base, model: ['gpt-image-2'], priority: 99 },
    { service_type: 'image', provider: 'gemini', name: `${t('settings.ai.quickServiceImage')} · Gemini`, base_url: base, model: ['gemini-3-pro-image', 'gemini-3.1-flash-image'], priority: 97 },
    { service_type: 'video', provider: 'aliyun', name: `${t('settings.ai.quickServiceVideo')} · Wan 3.0`, base_url: `${base}/qwen`, model: ['wan3.0-video', 'wan3.0-video-prime'], priority: 97 },
    { service_type: 'video', provider: 'volcengine', name: `${t('settings.ai.quickServiceVideo')} · Seedance`, base_url: `${base}/volcengine`, model: ['doubao-seedance-2-0-mini-260615', 'doubao-seedance-2-0-fast-260128', 'doubao-seedance-2-0-260128'], priority: 96 },
    { service_type: 'video', provider: 'minimax', name: `${t('settings.ai.quickServiceVideo')} · MiniMax`, base_url: `${base}/minimax`, model: ['MiniMax-H3'], priority: 98 },
  ]
})

function byType(t) { return cfgs.value.filter(c => c.service_type === t) }
function countActive(t) { return byType(t).filter(c => c.is_active).length }
function fmtModel(m) { return Array.isArray(m) ? m.join(', ') : m || '—' }
function presetsByType(type) {
  const group = providerPresets.value[type] || {}
  return Object.entries(group).map(([provider, preset]) => ({ provider, ...preset }))
}
function applyProviderPreset(type, provider) {
  const preset = providerPresets.value[type]?.[provider]
  if (!preset) return
  cfgForm.provider = provider
  cfgForm.base_url = preset.baseUrl
  cfgForm.models = [...preset.models]
  cfgForm.name = `${preset.label}-${type}`
}

async function loadCfgs() { try { cfgs.value = await aiConfigAPI.list() } catch (e) { toastError(e) } }

// ===== 默认模型选择 =====
// 默认解析规则与工作台/后端一致：启用配置中优先级最高者的模型列表首位
function defaultModelOf(type) {
  const active = cfgs.value.filter(c => c.service_type === type && c.is_active)
  if (!active.length) return null
  const top = [...active].sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]
  const first = Array.isArray(top.model) ? top.model[0] : null
  return first ? { configId: top.id, model: first } : null
}
function isDefaultModel(type, c, m) {
  const d = defaultModelOf(type)
  return !!d && d.configId === c.id && d.model === m
}
const defaultSaving = ref(false)
async function setDefaultModel(type, c, m) {
  if (defaultSaving.value || isDefaultModel(type, c, m)) return
  defaultSaving.value = true
  try {
    const models = [m, ...(Array.isArray(c.model) ? c.model : []).filter(x => x !== m)]
    const maxPriority = Math.max(0, ...cfgs.value.filter(x => x.service_type === type).map(x => x.priority || 0))
    const payload = { model: models }
    if ((c.priority || 0) < maxPriority) payload.priority = maxPriority + 1
    if (!c.is_active) payload.is_active = true // 停用配置无法成为默认,选择即启用
    await aiConfigAPI.update(c.id, payload)
    toast.success(t('settings.ai.defaultModelSwitched', { type: serviceMeta.value[type].label, model: m }))
    await loadCfgs()
  } catch (e) {
    toastError(e)
  } finally {
    defaultSaving.value = false
  }
}
async function toggleCfg(c) { await aiConfigAPI.update(c.id, { is_active: !c.is_active }); loadCfgs() }
async function delCfg(id) { await aiConfigAPI.del(id); toast.success(t('index.deleted')); loadCfgs() }

async function refreshAntigravityStatus() {
  antigravityChecking.value = true
  try {
    const res = await aiConfigAPI.test({
      service_type: 'text',
      provider: 'antigravity',
      base_url: 'http://127.0.0.1:8317',
      api_key: 'huobao-antigravity',
      model: 'gemini-3.8-flash-high',
    })
    antigravityStatus.value = {
      available: !!(res?.ok || res?.data?.ok || res?.reachable || res?.data?.reachable),
    }
  } catch (e) {
    antigravityStatus.value = { available: false }
  } finally {
    antigravityChecking.value = false
  }
}

async function applyAntigravityQuickConfig() {
  antigravitySaving.value = true
  try {
    for (const preset of antigravityQuickConfigs.value) {
      const payload = { ...preset, api_key: 'huobao-antigravity', is_active: true }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.provider === preset.provider && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success(t('settings.ai.antigravityQuickApplied'))
    await loadCfgs()
    await refreshAntigravityStatus()
  } catch (e) {
    toastError(e)
  } finally {
    antigravitySaving.value = false
  }
}

async function loadFlowAccounts() {
  try {
    const res = await flowBridgeAPI.accounts()
    const list = res?.data ?? res
    if (Array.isArray(list)) {
      flowAccounts.value = list
    }
  } catch (e) {
    console.warn('Failed to load flow accounts', e)
  }
}

async function refreshFlowStatus(forceRefresh = false) {
  flowChecking.value = true
  try {
    const res = await flowBridgeAPI.status(forceRefresh)
    flowStatus.value = (res && typeof res === 'object' && 'available' in res) ? res : (res?.data ?? res)
    if (Array.isArray(flowStatus.value?.accounts)) flowAccounts.value = flowStatus.value.accounts
    else await loadFlowAccounts()
  } catch (e) {
    flowStatus.value = { available: false, activeAccounts: 0, totalCredits: 0, lastError: e?.message || String(e) }
  } finally {
    flowChecking.value = false
  }
}

async function handleSwitchFlowAccount(acc) {
  if (!acc || acc.is_active || flowSwitchingId.value !== null || flowChecking.value) return
  flowSwitchingId.value = acc.id
  try {
    const res = await flowBridgeAPI.switchAccount(acc.id)
    if (res?.success || res?.code === 0 || res?.data?.success) {
      toast.success(t('settings.ai.flowSwitchSuccess'))
      if (Array.isArray(res?.accounts)) flowAccounts.value = res.accounts
      await refreshFlowStatus(true)
    } else {
      toast.error(res?.msg || 'Failed to switch account')
    }
  } catch (e) {
    toastError(e)
  } finally {
    flowSwitchingId.value = null
  }
}

function openFlowImportModal() {
  flowImportJson.value = ''
  showFlowImportModal.value = true
}

async function handleImportFlowAccount() {
  const raw = flowImportJson.value.trim()
  if (!raw) return
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    toast.error('JSON ไม่ถูกต้อง กรุณาตรวจสอบรูปแบบ')
    return
  }
  flowImporting.value = true
  try {
    const res = await flowBridgeAPI.importAccount(parsed)
    if (res?.success || res?.code === 0 || res?.data?.success) {
      toast.success(t('settings.ai.flowImportSuccess'))
      showFlowImportModal.value = false
      flowImportJson.value = ''
      await refreshFlowStatus(true)
    } else {
      toast.error(res?.msg || 'นำเข้า Cookie ล้มเหลว')
    }
  } catch (e) {
    toastError(e)
  } finally {
    flowImporting.value = false
  }
}

function handleDeleteFlowAccount(acc) {
  flowAccountToDelete.value = acc
}

async function confirmDeleteFlowAccount() {
  if (!flowAccountToDelete.value) return
  flowDeleting.value = true
  try {
    const id = flowAccountToDelete.value.id || flowAccountToDelete.value.filename
    const res = await flowBridgeAPI.deleteAccount(id)
    if (res?.success || res?.code === 0 || res?.data?.success) {
      toast.success(t('settings.ai.flowDeleteSuccess'))
      flowAccountToDelete.value = null
      await refreshFlowStatus(false)
      await loadFlowAccounts()
    } else {
      toast.error(res?.msg || 'Delete account failed')
    }
  } catch (e) {
    toastError(e)
  } finally {
    flowDeleting.value = false
  }
}

async function applyFlowQuickConfig(mode = 'native') {
  flowSaving.value = true
  try {
    const configs = mode === 'native' ? flowQuickConfigs.value : flowProxyQuickConfigs.value
    for (const preset of configs) {
      const payload = { ...preset, api_key: 'flow', is_active: true }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.provider === preset.provider && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success(t('settings.ai.flowQuickApplied'))
    await loadCfgs()
  } catch (e) {
    toastError(e)
  } finally {
    flowSaving.value = false
  }
}

async function applyGeminiQuickConfig() {
  const apiKey = geminiApiKey.value.trim()
  if (!apiKey) { toast.warning(t('settings.ai.geminiApiKeyRequired')); return }
  geminiSaving.value = true
  try {
    for (const preset of geminiQuickConfigs.value) {
      const payload = { ...preset, api_key: apiKey, is_active: true }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.provider === preset.provider && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success(t('settings.ai.geminiQuickApplied'))
    geminiApiKey.value = ''
    await loadCfgs()
  } catch (e) {
    toastError(e)
  } finally {
    geminiSaving.value = false
  }
}

async function applyOpenaiQuickConfig() {
  const apiKey = openaiApiKey.value.trim()
  if (!apiKey) { toast.warning(t('settings.ai.openaiApiKeyRequired')); return }
  openaiSaving.value = true
  try {
    for (const preset of openaiQuickConfigs.value) {
      const payload = { ...preset, api_key: apiKey, is_active: true }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.provider === preset.provider && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success(t('settings.ai.openaiQuickApplied'))
    openaiApiKey.value = ''
    await loadCfgs()
  } catch (e) {
    toastError(e)
  } finally {
    openaiSaving.value = false
  }
}

async function applyHuobaoQuickConfig() {
  const apiKey = huobaoApiKey.value.trim()
  if (!apiKey) { toast.warning(t('settings.ai.apiKeyRequired')); return }
  huobaoSaving.value = true
  try {
    for (const preset of huobaoQuickConfigs.value) {
      const payload = { ...preset, api_key: apiKey }
      const existing = cfgs.value.find(c => c.name === preset.name || (c.service_type === preset.service_type && c.provider === preset.provider && c.base_url === preset.base_url))
      if (existing) await aiConfigAPI.update(existing.id, payload)
      else await aiConfigAPI.create(payload)
    }
    toast.success(t('settings.ai.quickApplied'))
    huobaoApiKey.value = ''
    await loadCfgs()
  } catch (e) {
    toastError(e)
  } finally {
    huobaoSaving.value = false
  }
}
function startAddCfg(t) {
  cfgEditId.value = null
  cfgTestResult.value = null
  Object.assign(cfgForm, { name: '', provider: '', api_key: '', base_url: '', models: [], service_type: t, priority: 0, temperature: '' })
  const firstPreset = presetsByType(t)[0]
  if (firstPreset) applyProviderPreset(t, firstPreset.provider)
  cfgDialog.value = true
}
function startEditCfg(c) {
  cfgEditId.value = c.id
  cfgTestResult.value = null
  Object.assign(cfgForm, {
    name: c.name || '',
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    models: Array.isArray(c.model) ? [...c.model] : String(c.model || '').split(',').map(s => s.trim()).filter(Boolean),
    service_type: c.service_type,
    priority: c.priority ?? 0,
    temperature: c.temperature ?? '',
  })
  cfgDialog.value = true
}
async function testCfgPayload(payload) {
  cfgTesting.value = true
  try {
    cfgTestResult.value = await aiConfigAPI.test(payload)
    if (cfgTestResult.value.reachable) toast.success(t('settings.cfg.reachable'))
    else toast.warning(t('settings.cfg.unreachable'))
  } catch (e) {
    toastError(e)
  } finally {
    cfgTesting.value = false
  }
}
async function testDraftCfg() {
  await testCfgPayload({
    service_type: cfgForm.service_type,
    provider: cfgForm.provider,
    api_key: cfgForm.api_key,
    base_url: cfgForm.base_url,
    model: [...cfgForm.models],
  })
}
async function testExistingCfg(c) {
  startEditCfg(c)
  await testCfgPayload({
    service_type: c.service_type,
    provider: c.provider,
    api_key: c.api_key || '',
    base_url: c.base_url || '',
    model: Array.isArray(c.model) ? c.model : [],
  })
}
async function saveCfg() {
  if (!cfgForm.provider) { toast.warning(t('settings.cfg.providerRequired')); return }
  const models = [...cfgForm.models]
  const temperature = cfgForm.temperature === '' || cfgForm.temperature === null ? null : Number(cfgForm.temperature)
  if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    toast.warning(t('settings.cfg.tempInvalid')); return
  }
  try {
    if (cfgEditId.value) await aiConfigAPI.update(cfgEditId.value, { name: cfgForm.name, provider: cfgForm.provider, api_key: cfgForm.api_key, base_url: cfgForm.base_url, model: models, priority: cfgForm.priority, temperature })
    else await aiConfigAPI.create({ service_type: cfgForm.service_type, provider: cfgForm.provider, name: cfgForm.name || `${cfgForm.provider}-${cfgForm.service_type}`, api_key: cfgForm.api_key, base_url: cfgForm.base_url, model: models, priority: cfgForm.priority, temperature })
    cfgDialog.value = false; toast.success(t('common.saved')); loadCfgs()
  } catch (e) { toastError(e) }
}

// ===== Agent Configs =====
const agentCfgs = ref([])
const agentPane = ref('prompt')   // 右侧子 tab：prompt | skills
const agentSaving = ref(false)
const agentSaved = ref(null)
const agentForm = reactive({ system_prompt: '' })

const agentDefs = computed(() => [
  { type: 'script_rewriter', label: t('settings.agents.scriptRewriter'), icon: '📝' },
  { type: 'extractor', label: t('settings.agents.extractor'), icon: '🔍' },
  { type: 'storyboard_breaker', label: t('settings.agents.storyboardBreaker'), icon: '🎬' },
  { type: 'prompt_generator', label: t('settings.agents.promptGenerator'), icon: '🖼' },
])

function getAgentCfg(type) {
  return agentCfgs.value.find(a => a.agent_type === type)
}


async function loadAgents() {
  try { agentCfgs.value = await promptAPI.list() }
  catch (e) { toastError(e) }
}

async function loadAgentPrompt(type) {
  try {
    const cfg = await promptAPI.get(type, editLang.value)
    if (selectedAgent.value === type) {
      agentForm.system_prompt = cfg.system_prompt || ''
      agentPromptFallback.value = editLang.value !== 'zh' && !!cfg.is_default
    }
    agentSaved.value = null
  } catch (e) { toastError(e) }
}

async function resetAgentPrompt(type) {
  try {
    await promptAPI.reset(type, editLang.value)
    await loadAgents()
    const cfg = await promptAPI.get(type, editLang.value)
    agentForm.system_prompt = cfg.system_prompt || ''
    agentPromptFallback.value = editLang.value !== 'zh' && !!cfg.is_default
    toast.success(t('settings.agents.promptReset'))
  } catch (e) { toastError(e) }
}

async function saveAgentCfg(type) {
  agentSaving.value = true
  agentSaved.value = null
  try {
    await promptAPI.update(type, {
      name: agentDefs.value.find(a => a.type === type)?.label || type,
      system_prompt: agentForm.system_prompt,
    }, editLang.value)
    await loadAgents()
    agentPromptFallback.value = false
    agentSaved.value = type
    toast.success(t('settings.agents.saved', { agent: agentDefs.value.find(a => a.type === type)?.label }))
    setTimeout(() => { if (agentSaved.value === type) agentSaved.value = null }, 3000)
  } catch (e) {
    toastError(e)
  } finally {
    agentSaving.value = false
  }
}

// ===== Skills =====
const selectedAgent = ref('script_rewriter')
const allSkills = ref([])   // { id, name, description }[]
const editingSkill = ref(null)
const skillContent = ref('')
const skillSaving = ref(false)
const skillSaved = ref(null)
const addSkillDialog = ref(false)
const newSkillForm = reactive({ id: '', name: '', description: '' })

const selectedAgentType = computed(() => selectedAgent.value)
const selectedAgentLabel = computed(() => agentDefs.value.find(a => a.type === selectedAgent.value)?.label || '')
const selectedAgentIcon = computed(() => agentDefs.value.find(a => a.type === selectedAgent.value)?.icon || '')

// ===== 通用：AI 内容语言（全局设置，与界面语言相互独立） =====
const contentLanguage = ref('th')
const contentLangOptions = [
  { value: 'th', label: 'ไทย', shortLabel: 'ไทย' },
  { value: 'zh', label: '中文', shortLabel: '中文' },
  { value: 'en', label: 'English', shortLabel: 'EN' },
  { value: 'ja', label: '日本語', shortLabel: '日本語' },
  { value: 'ko', label: '한국어', shortLabel: '한국어' },
]
// ===== Agent 配置：prompt/skill 编辑的语言版本（只读跟随内容语言） =====
const agentPromptFallback = ref(false)   // 当前语言无独立 prompt 文件，展示的是回退内容
const skillContentFallback = ref(false)  // 同上，skill 编辑器
const promptFileName = computed(() => `workspace/prompts/${selectedAgent.value}${editLang.value !== 'zh' ? `.${editLang.value}` : ''}.md`)
const skillFileName = computed(() => `SKILL${editLang.value !== 'zh' ? `.${editLang.value}` : ''}.md`)

// Agent 编辑语言 = 全局内容语言的只读镜像（改语言请到「通用」页）
const editLang = computed(() => contentLanguage.value)
const contentLangLabel = computed(() =>
  contentLangOptions.find(l => l.value === contentLanguage.value)?.label || contentLanguage.value)

// 内容语言变化时同步刷新 Agent 面板（提示词、Skill 列表与展开内容）
// 内容语言切换后整页刷新（setUnifiedLanguage），无需局部 watch 同步
// ===== 通用：外观主题（localStorage 持久化，即时生效） =====
const { themeMode, setThemeMode } = useTheme()
const themeOptions = computed(() => [
  { value: 'light', label: t('settings.general.appearanceLight') },
  { value: 'dark', label: t('settings.general.appearanceDark') },
  { value: 'system', label: t('settings.general.appearanceSystem') },
])

async function loadContentLanguage() {
  try {
    const lang = (await settingsAPI.contentLanguage())?.language || 'th'
    contentLanguage.value = lang
    editLang.value = lang  // Agent 编辑器默认跟随内容语言
  } catch { /* 保持默认 */ }
}
async function setContentLanguage(lang) {
  if (contentLanguage.value === lang) return
  // UI 语言 = AI 内容语言：确认弹窗 → 统一切换 → 刷新（顶栏 LocaleSwitcher 同一入口）
  await confirmUnifiedLanguage(lang)
}
onMounted(loadContentLanguage)

// agent type 用下划线（script_rewriter），skill 目录按 Mastra 规范用连字符（script-rewriter）
const skillDirOf = (type) => type.replace(/_/g, '-')
const skillBelongsTo = (skillId, type) => {
  const dir = skillDirOf(type)
  return skillId === dir || skillId.startsWith(dir + '/')
}

function agentSkillCount(type) {
  return allSkills.value.filter(s => skillBelongsTo(s.id, type)).length
}

const currentSkills = computed(() =>
  allSkills.value.filter(s => skillBelongsTo(s.id, selectedAgent.value))
)

async function loadAllSkills() {
  try { allSkills.value = await skillsAPI.list(editLang.value) }
  catch (e) { toastError(e) }
}

async function selectAgent(type) {
  if (selectedAgent.value !== type) {
    selectedAgent.value = type
    editingSkill.value = null
  }
  await loadAgentPrompt(type)
}

function startAddSkill() {
  newSkillForm.id = ''
  newSkillForm.name = ''
  newSkillForm.description = ''
  addSkillDialog.value = true
}

async function confirmAddSkill() {
  if (!newSkillForm.id) return
  const skillId = `${skillDirOf(selectedAgent.value)}/${newSkillForm.id}`
  try {
    await skillsAPI.create({ id: skillId, name: newSkillForm.name, description: newSkillForm.description })
    addSkillDialog.value = false
    await loadAllSkills()
    toast.success(t('settings.skills.created'))
  } catch (e) {
    toastError(e)
  }
}

const skillToDelete = ref(null)
const deletingSkill = ref(false)

async function confirmDelSkill() {
  const id = skillToDelete.value
  if (!id) return
  try {
    deletingSkill.value = true
    await skillsAPI.del(id)
    if (editingSkill.value === id) editingSkill.value = null
    await loadAllSkills()
    skillToDelete.value = null
    toast.success(t('index.deleted'))
  } catch (e) {
    toastError(e)
  } finally {
    deletingSkill.value = false
  }
}

async function toggleSkillEdit(id) {
  if (editingSkill.value === id) { editingSkill.value = null; return }
  try {
    const res = await skillsAPI.get(id, editLang.value)
    skillContent.value = res.content
    skillContentFallback.value = editLang.value !== 'zh' && !!res.is_default
    skillSaved.value = null
    editingSkill.value = id
  } catch (e) { toastError(e) }
}

async function saveSkill(id) {
  skillSaving.value = true
  skillSaved.value = null
  try {
    await skillsAPI.update(id, skillContent.value, editLang.value)
    await loadAllSkills()
    skillContentFallback.value = false
    skillSaved.value = id
    toast.success(t('common.saved'))
    setTimeout(() => { if (skillSaved.value === id) skillSaved.value = null }, 3000)
  } catch (e) {
    toastError(e)
  } finally {
    skillSaving.value = false
  }
}

// ===== Style Presets =====
const stylePresets = ref([])
const styleDialog = ref(false)
const styleEditId = ref(null)
const styleForm = reactive({ name: '', value: '', prompt: '', description: '', sort_order: 0 })

async function loadStylePresets() {
  try { stylePresets.value = await stylePresetAPI.list(true) } catch (e) { toastError(e) }
}

function styleName(p) {
  if (!p) return ''
  const k = `settings.styles.presetNames.${p.value}`
  return te(k) ? t(k) : (p.name || p.value)
}

function styleDesc(p) {
  if (!p) return ''
  const k = `settings.styles.presetDescs.${p.value}`
  return te(k) ? t(k) : (p.description || '')
}

async function toggleStyle(p) {
  try {
    await stylePresetAPI.update(p.id, { is_active: !p.is_active })
    loadStylePresets()
  } catch (e) { toastError(e) }
}

const styleToDelete = ref(null)
const deletingStyle = ref(false)

async function confirmDelStyle() {
  const p = styleToDelete.value
  if (!p) return
  try {
    deletingStyle.value = true
    await stylePresetAPI.del(p.id)
    styleToDelete.value = null
    toast.success(t('index.deleted'))
    loadStylePresets()
  } catch (e) {
    toastError(e)
  } finally {
    deletingStyle.value = false
  }
}

function startAddStyle() {
  styleEditId.value = null
  Object.assign(styleForm, {
    name: '', value: '', prompt: '', description: '',
    sort_order: (stylePresets.value.at(-1)?.sort_order ?? 0) + 1,
  })
  styleDialog.value = true
}

function startEditStyle(p) {
  styleEditId.value = p.id
  Object.assign(styleForm, {
    name: p.name,
    value: p.value,
    prompt: p.prompt,
    description: p.description || '',
    sort_order: p.sort_order ?? 0,
  })
  styleDialog.value = true
}

async function saveStyle() {
  if (!styleForm.name?.trim() || !styleForm.prompt?.trim() || (!styleEditId.value && !styleForm.value?.trim())) {
    toast.warning(t('settings.styleDialog.required'))
    return
  }
  try {
    if (styleEditId.value) {
      await stylePresetAPI.update(styleEditId.value, {
        name: styleForm.name,
        prompt: styleForm.prompt,
        description: styleForm.description,
        sort_order: styleForm.sort_order,
      })
    } else {
      await stylePresetAPI.create({ ...styleForm })
    }
    styleDialog.value = false
    toast.success(t('common.saved'))
    loadStylePresets()
  } catch (e) { toastError(e) }
}

onMounted(() => { loadCfgs(); loadAgents(); loadAllSkills(); loadAgentPrompt(selectedAgent.value); loadStylePresets(); refreshFlowStatus(); refreshAntigravityStatus() })

// Read cached bridge account data only; never trigger live balance probes on a timer.
let flowAccountPoll = null
onMounted(() => {
  flowAccountPoll = setInterval(() => {
    if (!document.hidden && !flowChecking.value && flowSwitchingId.value === null && !flowImporting.value && !flowDeleting.value) {
      refreshFlowStatus(false)
    }
  }, 5000)
})
onBeforeUnmount(() => {
  if (flowAccountPoll !== null) clearInterval(flowAccountPoll)
})

// ===== 应用内引导（设置页）：快捷配置 + 手动模板两步 =====
const SETTINGS_TOUR = [
  { element: '.quick-card', titleKey: 'tour.settings.quick.title', descKey: 'tour.settings.quick.desc', popoverSide: 'bottom' },
  { element: '.nav-item:has(.lucide-cpu), .nav-item:nth-of-type(1)', titleKey: 'tour.settings.nav.title', descKey: 'tour.settings.nav.desc', popoverSide: 'right' },
]
onMounted(() => setTimeout(() => autoTour('settings', SETTINGS_TOUR, t), 800))
function replaySettingsTour() { startTour('settings', SETTINGS_TOUR, t) }

// ===== 存储位置 =====
const desktopBridge = useDesktopBridge()
const { begin: beginMigrate, update: updateMigrate, end: endMigrate } = useMigrateState()

const storageInfo = ref(null)
const migrateDialog = ref(false)
const migrateTarget = ref('')
const migrateTargetFree = ref(null)
const migrateFiles = ref(true)
const migrating = ref(false)

const isDesktopMode = computed(() => storageInfo.value?.mode === 'desktop' && !!desktopBridge)

let usagePollTimer = null

function stopUsagePoll() {
  if (usagePollTimer) { clearInterval(usagePollTimer); usagePollTimer = null }
}

async function loadStorage() {
  try {
    storageInfo.value = await storageAPI.info()
    // 占用为空或统计已过期时 2s 轮询至新鲜（后端 stale-while-revalidate）
    stopUsagePoll()
    if (storageInfo.value?.usageStale || !storageInfo.value?.usage) {
      usagePollTimer = setInterval(async () => {
        try {
          storageInfo.value = await storageAPI.info()
          if (storageInfo.value?.usage && !storageInfo.value?.usageStale) stopUsagePoll()
        } catch { /* 轮询错误静默 */ }
      }, 2000)
    }
  } catch (e) { toastError(e, { fallback: 'settings.storage.loadFailed' }) }
}

watch(tab, (active) => {
  if (active === 'storage') loadStorage()
  else stopUsagePoll()
})

async function pickTarget() {
  if (!desktopBridge) return
  const res = await desktopBridge.pickDirectory()
  if (res.canceled) return
  if (!res.ok || !res.path) { toastError(res.error, { fallback: 'settings.migrate.pickFailed' }); return }
  migrateTarget.value = res.path
  migrateTargetFree.value = res.freeBytes ?? null
  migrateFiles.value = true
  migrateDialog.value = true
}

async function startMigrate() {
  if (!desktopBridge || !migrateTarget.value) return
  migrating.value = true
  beginMigrate()
  try {
    await desktopBridge.startMigration({ targetDir: migrateTarget.value, migrateFiles: migrateFiles.value })
    // 成功的完成提示与页面刷新由全局进度订阅（app.vue）处理
  } catch (e) {
    endMigrate()
    toastError(e, { fallback: 'settings.migrate.failed' })
  } finally {
    migrating.value = false
    migrateDialog.value = false
    stopUsagePoll()
  }
}

function formatBytes(n) {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

// ===== 应用内更新（桌面版走 Electron 桥；服务器/Docker 走后端 server-update 路由） =====
const updateState = ref(null)
const updateChecking = ref(false)
const updateDownloading = ref(false)
const updateProgress = ref(0)
const updateApplying = ref(false)
const serverUpdateMode = ref('manual') // 'watchtower' | 'manual'，仅服务器模式有意义

async function refreshUpdateState() {
  try {
    if (desktopBridge) {
      updateState.value = await desktopBridge.getUpdateState()
    } else {
      const s = await serverUpdateAPI.state()
      serverUpdateMode.value = s.updateMode || 'manual'
      updateState.value = s
    }
  } catch { /* 静默 */ }
}

async function checkUpdate() {
  updateChecking.value = true
  try {
    if (desktopBridge) {
      updateState.value = await desktopBridge.checkUpdate()
    } else {
      const s = await serverUpdateAPI.check()
      serverUpdateMode.value = s.updateMode || 'manual'
      updateState.value = s
    }
    if (updateState.value?.status === 'up-to-date') toast.success(t('settings.about.upToDate'))
  } catch (e) {
    toastError(e, { fallback: 'settings.about.checkFailedToast' })
    refreshUpdateState()
  } finally { updateChecking.value = false }
}

async function downloadUpdate() {
  if (!desktopBridge) return
  updateDownloading.value = true
  updateProgress.value = 0
  const unProgress = desktopBridge.onUpdateProgress((p) => { updateProgress.value = p })
  try {
    updateState.value = await desktopBridge.downloadUpdate()
    toast.success(t('settings.about.downloadDone'))
  } catch (e) {
    toastError(e, { fallback: 'settings.about.downloadFailed' })
    refreshUpdateState()
  } finally {
    unProgress()
    updateDownloading.value = false
  }
}

async function applyUpdate() {
  updateApplying.value = true
  try {
    if (desktopBridge) {
      await desktopBridge.applyUpdate()
      // 成功路径：应用退出并由更新后的版本接管，不会走到这里
    } else {
      await serverUpdateAPI.apply()
      // Watchtower 异步拉镜像重建容器，本进程随后被替换
      toast.success(t('settings.about.serverApplyStarted'), { duration: 8000 })
      updateApplying.value = false
    }
  } catch (e) {
    updateApplying.value = false
    toastError(e, { fallback: desktopBridge ? 'settings.about.installFailed' : 'settings.about.serverApplyFailed' })
    refreshUpdateState()  // 桌面端 apply 失败会把具体原因写进 updateState.error，刷新显示在错误行
  }
}

watch(tab, (t) => {
  if (t === 'about') refreshUpdateState()
  // 进入 Agent 页总是按当前内容语言重载（幂等）：兜住「先切语言、后进 Agent」的时序
  if (t === 'agents') {
    loadAgentPrompt(selectedAgent.value)
    loadAllSkills()
  }
})

onBeforeUnmount(stopUsagePoll)
</script>

<style scoped>
.settings-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-base); }

.settings-layout { display: flex; flex: 1; min-height: 0; }

.settings-nav {
  width: 220px; flex-shrink: 0; padding: 16px 12px 16px; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 14px;
}
.nav-group { display: flex; flex-direction: column; gap: 2px; }
.nav-group-label {
  font-size: 11px; font-weight: 650; color: var(--text-3);
  letter-spacing: 0.06em; padding: 8px 12px 4px;
}
.nav-item {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; font-size: 13px; font-weight: 550;
  border: none; border-radius: var(--radius); background: transparent; color: var(--text-1);
  cursor: pointer; transition: all 0.16s var(--ease-out); text-align: left; width: 100%;
}
.nav-item:hover { background: var(--bg-hover); color: var(--text-0); }
.nav-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; }
.nav-item:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

.settings-content { flex: 1; min-width: 0; min-height: 0; overflow: hidden; }
.settings-scroll { height: 100%; overflow-y: auto; padding: 20px 28px 48px; animation: fadeUp 0.3s var(--ease-out); }
/* 各分组卡片之间的间距（通用页内容语言/外观等） */
.settings-scroll > .card + .card { margin-top: 14px; }
/* 宽屏下内容列限宽居中，两侧留出呼吸空间 */
.settings-scroll > * { max-width: 1080px; margin-left: auto; margin-right: auto; }
.settings-head { margin-bottom: 20px; }
.settings-title { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
.settings-desc { font-size: 13px; color: var(--text-2); margin-top: 6px; }

/* 火宝快捷配置 */
.quick-card {
  padding: 20px;
  margin-bottom: 16px;
  border: 1.5px solid var(--accent);
}
.quick-card:hover { border-color: var(--accent); }
.quick-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.setup-title { font-size: 15px; font-weight: 700; color: var(--text-0); }
.setup-desc { font-size: 12.5px; color: var(--text-2); margin-bottom: 14px; }
.huobao-site-link {
  display: inline-flex; align-items: center; gap: 3px;
  margin-left: 6px;
  color: var(--accent); text-decoration: none;
  font-weight: 600; white-space: nowrap;
}
.quick-tab-icon {
  width: 13px;
  height: 13px;
  object-fit: contain;
  margin-right: 5px;
  display: inline-block;
  vertical-align: -1px;
}
.huobao-quick-row {
  display: flex;
  gap: 10px;
  align-items: center;
}
.huobao-quick-row .input {
  flex: 1;
  min-width: 0;
}
.huobao-quick-models {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.hqm-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11px;
  line-height: 1.6;
}
.hqm-label {
  flex-shrink: 0;
  width: 28px;
  font-weight: 600;
  color: var(--text-2);
}
.hqm-provider {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.hqm-provider-icon { width: 11px; height: 11px; object-fit: contain; border-radius: 2px; }
.hqm-models {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  color: var(--text-3);
}
.hqm-model.is-default { color: var(--text-1); font-weight: 600; }
.hqm-model em {
  font-style: normal;
  margin-left: 4px;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent-bg);
}

/* 模型标签编辑器（配置弹窗） */
.model-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 8px;
}
.model-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-2);
  background: var(--bg-2);
  cursor: pointer;
  user-select: none;
  transition: border-color .15s, color .15s;
}
.model-chip:hover { border-color: var(--accent); color: var(--text-1); }
.model-chip.is-default { color: var(--text-1); font-weight: 600; border-color: var(--accent); }
.model-chip em {
  font-style: normal;
  padding: 0 5px;
  border-radius: 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--accent-text);
  background: var(--accent-bg);
}
.model-chip-x {
  display: inline-flex;
  align-items: center;
  padding: 1px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
}
.model-chip-x:hover { color: var(--error); background: var(--bg-3); }
.model-add-row { display: flex; gap: 8px; }
.model-add-row .input { flex: 1; }

/* 手动模板 */
.setup-panel { padding: 18px 20px; margin-bottom: 16px; }
.setup-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.setup-panel-head.compact { margin-bottom: 12px; }
.template-row { display: flex; flex-wrap: wrap; gap: 8px; }
.template-type-chip {
  min-height: var(--button-height-sm);
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--button-bg);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.16s var(--ease-out);
}
.template-type-chip:hover { background: var(--button-bg-hover); color: var(--text-0); }
.template-type-chip:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

/* ===== 内容语言选择器（通用 tab） ===== */
.lang-picker { display: flex; gap: 2px; padding: 3px; border-radius: var(--radius-pill); background: var(--overlay-track); }
.lang-option {
  min-height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-2);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.16s var(--ease-out);
  white-space: nowrap;
}
.lang-option:hover { color: var(--text-0); }
.lang-option.on { background: var(--seg-active-bg); color: var(--text-0); box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
.lang-option:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }

/* 按服务类型分组的配置卡 */
.sections { display: flex; flex-direction: column; gap: 16px; }
.svc-group { overflow: hidden; }
.svc-group-head {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
}
.svc-group-heading { min-width: 0; }
.svc-group-title { font-size: 14px; font-weight: 700; color: var(--text-0); }
.svc-group-sub { font-size: 11.5px; color: var(--text-3); margin-top: 2px; }
.config-row { display: flex; align-items: center; gap: 12px; padding: 12px 20px; }
.config-row + .config-row { border-top: 1px solid var(--border); }
.provider-badge {
  width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 14px; color: var(--on-accent);
  background: var(--accent);
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
}
.provider-badge[data-provider="openai"] { background: #10a37f; }
.provider-badge[data-provider="gemini"] { background: #4285f4; }
.provider-badge[data-provider="volcengine"] { background: #ff5c39; }
/* 有厂商图标时用中性底，彩色图标直接展示 */
.provider-badge.has-icon { background: var(--bg-2); }
.provider-badge-icon { width: 20px; height: 20px; object-fit: contain; }
.config-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.config-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.config-name { font-size: 13.5px; font-weight: 650; color: var(--text-0); }
.config-sub { font-size: 11.5px; color: var(--text-3); }
.config-models { display: flex; flex-wrap: wrap; gap: 4px; margin: 3px 0; }
.cfg-model-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-2);
  font-size: 10.5px;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
}
.cfg-model-chip:hover { border-color: var(--accent); color: var(--accent); }
.cfg-model-chip.is-default {
  border-color: var(--accent);
  background: var(--accent-bg);
  color: var(--accent);
  font-weight: 600;
  cursor: default;
}
.cfg-model-star { fill: currentColor; }
.config-empty { font-size: 12px; color: var(--text-3); padding: 14px 20px; }
.config-switch { display: inline-flex; flex-shrink: 0; cursor: pointer; }
.config-switch input:focus-visible + .switch { box-shadow: 0 0 0 3.5px var(--button-focus); }
.btn-icon.btn-sm { width: 30px; min-width: 30px; height: 30px; min-height: 30px; }

/* Agent */
.agent-card { overflow: hidden; }
.agent-type-badge {
  width: 36px; height: 36px; border-radius: 10px;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; flex-shrink: 0;
}
.agent-card-body { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
/* tab 头在上，body 不再需要顶边框（头自带 border-bottom） */
.agent-card-foot { display: flex; align-items: center; gap: 8px; padding-top: 4px; }

/* Agent 右侧子 tab（System Prompt / Skills）：作为卡片头，与卡片同宽，不再单独悬浮 */
.agent-pane-tabs {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}
.agent-pane-tabs-wrap .agent-pane-tabs { border-bottom: 1px solid var(--border); }
.agent-pane-tabs-wrap { padding: 0; margin-bottom: 14px; overflow: hidden; }
.agent-pane-tabs-nav {
  display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 3px;
  background: var(--bg-1); border: 1px solid var(--border); border-radius: 10px;
}
.agent-pane-tab {
  padding: 5px 18px; border: none; border-radius: 7px;
  background: transparent; color: var(--text-2);
  font: 600 12px var(--font-body); cursor: pointer;
  white-space: nowrap; text-align: center;
  transition: background 0.15s, color 0.15s;
}
.agent-pane-tab:hover { color: var(--text-0); }
.agent-pane-tab.active { background: var(--accent-bg); color: var(--accent-text); }

/* Agent 编辑语言跟随提示（卡片头右侧只读说明，切换请到「通用」页） */
.agent-lang-follow { font-size: 11px; }

/* 「跟随中文」回退提示 */
.agent-fallback-tag {
  margin-left: 6px;
  background: var(--bg-2); color: var(--text-3);
  font-size: 10px; font-weight: 500;
}

/* 编辑器尽量占满剩余视口高度，仍可手动拖拽 */
.agent-prompt-input { min-height: max(320px, calc(100vh - 340px)); resize: vertical; }
.skill-content-input { min-height: max(300px, calc(100vh - 420px)); resize: vertical; }

/* Skills 布局 */
.skills-layout { display: flex; height: 100%; overflow: hidden; }
.skills-agent-list {
  width: 210px; flex-shrink: 0; border-right: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 4px;
  overflow-y: auto; padding: 20px 10px 16px;  /* 顶 padding 与右侧标题行起点对齐 */
}
.skills-agent-title {
  font-size: 11px; font-weight: 650; letter-spacing: 0.06em;
  color: var(--text-3); padding: 8px 10px 4px;
}
.skills-agent-item {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; font-size: 13px; font-weight: 550; cursor: pointer;
  border: none; border-radius: var(--radius); background: transparent; color: var(--text-1);
  transition: all 0.16s var(--ease-out); width: 100%; text-align: left;
}
.skills-agent-item:hover { background: var(--bg-hover); color: var(--text-0); }
.skills-agent-item.active { background: var(--accent-bg); color: var(--accent-text); font-weight: 650; }
.skills-agent-item:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.skills-agent-item .agent-type-badge { width: 26px; height: 26px; border-radius: 8px; font-size: 13px; }
.skills-agent-label { flex: 1; min-width: 0; }
.skill-count-badge {
  font-size: 10px; font-weight: 700; font-family: var(--font-mono);
  background: var(--bg-active); color: var(--text-2);
  padding: 1px 6px; border-radius: 99px;
}
.skills-agent-item.active .skill-count-badge { background: var(--accent-bg); color: var(--accent-text); }
.skills-main { flex: 1; min-width: 0; }
.skills-head {
  display: flex;
  align-items: flex-start;   /* 以标题块顶部为基线，徽章/按钮对齐标题第一行 */
  gap: 12px;
}
.skills-head .settings-title { line-height: 26px; }
.skills-head .btn { margin-top: -2px; }  /* 视觉上与标题第一行居中（按钮比标题行高） */
.skills-head-badge { width: 32px; height: 32px; font-size: 16px; }
.skills-head-copy { min-width: 0; }
.skills-empty { padding: 48px 24px; text-align: center; }
.skills-empty-icon {
  width: 56px; height: 56px; border-radius: 16px; margin: 0 auto 12px;
  background: var(--accent-bg); color: var(--accent-text);
  display: flex; align-items: center; justify-content: center;
}
.skills-empty-title { font-size: 14px; font-weight: 650; color: var(--text-0); }
.skills-empty-desc { font-size: 12px; color: var(--text-3); margin-top: 4px; }

/* Skill */
.skill-list { display: flex; flex-direction: column; gap: 10px; }
.skill-card { overflow: hidden; }
.skill-card-head { display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; transition: background 0.15s; }
.skill-card-head:hover { background: var(--bg-hover); }
.skill-card-body { padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--border); }
.skill-card-foot { display: flex; align-items: center; gap: 8px; }

/* Shared */
.field { display: flex; flex-direction: column; gap: 5px; }
.field-label { font-size: 12px; font-weight: 550; color: var(--text-1); }
.field-hint { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.required { color: var(--error); }
.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

/* Dialogs */
.config-dialog { width: min(720px, calc(100vw - 40px)); }
.config-dialog-body { display: flex; flex-direction: column; gap: 14px; }
.skill-dialog { width: 440px; }
.skill-dialog-body { display: flex; flex-direction: column; gap: 12px; }
.dialog-sub { margin-top: 4px; font-size: 12px; color: var(--text-2); }
.test-draft-btn { margin-right: auto; }
.preset-picker { display: flex; flex-wrap: wrap; gap: 8px; }
.preset-pill {
  min-height: var(--button-height-sm);
  padding: 0 14px;
  border: none;
  border-radius: var(--radius-pill);
  background: var(--button-bg);
  color: var(--text-1);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  transition: all 0.16s var(--ease-out);
}
.preset-pill:hover { background: var(--button-bg-hover); color: var(--text-0); }
.preset-pill:focus-visible { outline: none; box-shadow: 0 0 0 3.5px var(--button-focus); }
.test-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-radius: var(--radius-lg);
  padding: 12px 14px;
  border: 1px solid var(--border);
  background: var(--bg-0);
}
.test-result.ok { border-color: var(--success); background: var(--success-bg); }
.test-result.bad { border-color: var(--error); background: var(--error-bg); }
.test-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-1);
}
.test-result-url,
.test-result-preview {
  font-size: 11px;
  color: var(--text-2);
  word-break: break-all;
}

/* 存储位置 */
.storage-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 2px;
}
.migrate-warn {
  color: var(--error);
}
.update-bar {
  width: 220px;
  height: 5px;
  border-radius: 3px;
  background: var(--overlay-track);
  overflow: hidden;
  margin-top: 6px;
}
.update-bar-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--accent);
  transition: width 0.2s ease;
}
</style>
