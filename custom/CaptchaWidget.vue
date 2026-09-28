<template>
  <div class="w-full flex justify-center items-center">
    <div class="w-full" ref="widgetHost"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useCoreStore } from '@/stores/core';

const coreStore = useCoreStore();

interface Props {
  meta: {
    renderWidgetFunctionName: string;
    containerId: string;
    siteKey: string;
  };
  /**
   * Incremented by login page on every rejected login attempt.
   */
  failedLoginAttempts?: number;
}

const props = defineProps<Props>();

const widgetHost = ref<HTMLElement | null>(null);
const emit = defineEmits<{
  (event: 'update:disableLoginButton', value: boolean): void;
  (event: 'update:setLoginParam', name: string, value: string | undefined): void;
}>();
const theme = coreStore.theme;

onMounted(() => {
  renderWidget();
});

// solved captcha is spent by a single login attempt, so after rejected attempt user has to solve a new one
watch(() => props.failedLoginAttempts, () => {
  renderWidget();
});

function renderWidget() {
  const fnName = props.meta.renderWidgetFunctionName;
  const renderFn = (window as any)[fnName];
  if (typeof renderFn !== 'function') {
    console.warn(`Function ${fnName} not found on window`);
    return;
  }

  // captcha providers refuse to render into element which already holds a widget, so every render
  // gets a brand new container element
  widgetHost.value.innerHTML = '';
  const container = document.createElement('div');
  container.id = props.meta.containerId;
  container.className = 'w-full';
  container.dataset.theme = theme;
  widgetHost.value.appendChild(container);

  setToken(undefined);
  renderFn(props.meta.containerId, props.meta.siteKey, setToken, () => setToken(undefined));
}

// token is sent with the /login request, so login is allowed only while there is an unexpired one
function setToken(token: string | undefined) {
  emit('update:setLoginParam', 'captchaToken', token);
  emit('update:disableLoginButton', !token);
}

</script>
