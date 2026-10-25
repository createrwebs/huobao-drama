<template>
  <div class="model-select">
    <span class="model-select-label">{{ label }}</span>
    <button ref="triggerRef" type="button" class="model-select-trigger" :class="{ open: isOpen }" @click="toggleMenu">
      <img v-if="triggerIcon" :src="triggerIcon" class="model-select-icon" alt="" />
      <span v-else-if="currentOption?.provider" class="model-select-provider">{{ currentOption.provider }}</span>
      <span class="model-select-value">{{ currentLabel }}</span>
      <ChevronDown :size="11" class="model-select-arrow" :class="{ open: isOpen }" />
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="model-select-backdrop" @click="isOpen = false" />
      <div v-if="isOpen" class="model-select-menu" :style="menuStyle">
        <button
          v-if="!hideDefault"
          type="button"
          class="model-select-option"
          :class="{ selected: modelValue === '' }"
          @click="pick('')"
        >
          <img v-if="defaultIcon" :src="defaultIcon" class="model-select-icon sm" alt="" />
          <span class="model-select-dim">{{ effectiveDefaultLabel }}</span>
          <Check :size="12" v-if="modelValue === ''" class="model-select-check ml-auto" />
        </button>

        <button
          v-for="o in options"
          :key="o.key || o.model"
          type="button"
          class="model-select-option"
          :class="{ selected: modelValue === (o.key || o.model) }"
          :title="`${o.model}${o.configName ? ` · ${o.configName}` : ''}`"
          @click="pick(o.key || o.model)"
        >
          <span class="model-select-option-name">{{ o.model }}</span>
          <span v-if="showConfig && o.configName" class="opt-config">{{ o.configName }}</span>
          <img v-if="modelIconUrl(o.provider, o.model)" :src="modelIconUrl(o.provider, o.model)" class="model-select-icon sm ml-auto" alt="" />
          <Check :size="12" v-if="modelValue === (o.key || o.model)" class="model-select-check" />
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronDown, Check } from 'lucide-vue-next'
import { modelIconUrl } from '~/composables/useProviderIcon'

const props = defineProps({
  label: { type: String, required: true },          // 改写 / 图片 / 视频
  modelValue: { type: String, default: '' },        // '' = 默认（配置首个模型）；选中值为 'provider/model' 复合键
  options: { type: Array, default: () => [] },      // [{ key, model, provider, configId, configName }]
  defaultLabel: { type: String, default: '' },      // 缺省回退 t('common.default')
  showConfig: { type: Boolean, default: false },    // 多配置时显示来源配置名
  hideDefault: { type: Boolean, default: false },   // 无「默认」语义的选择器（如分辨率）隐藏默认项
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const isOpen = ref(false)
const triggerRef = ref(null)
const menuStyle = ref({})

const effectiveDefaultLabel = computed(() => props.defaultLabel || t('common.default'))
const currentOption = computed(() => props.options.find(o => (o.key || o.model) === props.modelValue) || null)
const currentLabel = computed(() => currentOption.value?.model || effectiveDefaultLabel.value)
// 默认 = 首个选项；未显式选模型时也展示默认模型的厂商图标（与 defaultLabel 取 options[0] 同口径）
// 图标按模型名推断（网关 provider=openai 但模型实为 deepseek 等场景），回退 provider
const defaultIcon = computed(() => modelIconUrl(props.options[0]?.provider, props.options[0]?.model))
const triggerIcon = computed(() =>
  currentOption.value
    ? modelIconUrl(currentOption.value.provider, currentOption.value.model)
    : defaultIcon.value)

function updateMenuPosition() {
  if (!triggerRef.value) return
  const rect = triggerRef.value.getBoundingClientRect()
  menuStyle.value = {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${Math.min(rect.left, window.innerWidth - 290)}px`,
    minWidth: '280px',
    maxWidth: '360px',
    zIndex: 9999,
  }
}

function toggleMenu() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    updateMenuPosition()
  }
}

function pick(model) {
  emit('update:modelValue', model)
  isOpen.value = false
}
</script>

<style scoped>
.model-select {
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-select-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
}
.model-select-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  max-width: 210px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  background: var(--bg-input);
  color: var(--text-1);
  font: 11px var(--font-body);
  cursor: pointer;
  transition: border-color 0.16s, box-shadow 0.16s, background 0.16s;
}
.model-select-trigger:hover { border-color: var(--border-hover); }
.model-select-trigger.open,
.model-select-trigger:focus-visible {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--button-focus);
  outline: none;
}
.model-select-value {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.model-select-icon {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  object-fit: contain;
  border-radius: 2.5px;
}
.model-select-icon.sm { width: 12px; height: 12px; }
.model-select-provider {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.model-select-arrow {
  flex-shrink: 0;
  color: var(--text-3);
  transition: transform 0.18s var(--ease-out);
}
.model-select-arrow.open { transform: rotate(180deg); }

.model-select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.model-select-menu {
  background: var(--surface-raised, #1e1e24);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-lg, 8px);
  box-shadow: var(--shadow-elevated, 0 10px 30px rgba(0, 0, 0, 0.35));
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 380px;
  overflow-y: auto;
}

.model-select-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius-md, 6px);
  background: transparent;
  color: var(--text-1, #f1f5f9);
  font: 12px var(--font-body);
  text-align: left;
  cursor: pointer;
  width: 100%;
  transition: background 0.15s;
}
.model-select-option:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.06));
}
.model-select-option.selected {
  background: var(--accent-bg, rgba(249, 115, 22, 0.12));
  color: var(--accent, #f97316);
  font-weight: 600;
}
.model-select-option-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.opt-config {
  font-size: 10px;
  color: var(--text-3, #94a3b8);
  margin-left: 4px;
}
.model-select-check {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--accent, #f97316);
}
.model-select-dim {
  color: var(--text-3, #94a3b8);
}
</style>
