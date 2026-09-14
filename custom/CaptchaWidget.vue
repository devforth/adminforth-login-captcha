<template>
  <div class="w-full flex justify-center items-center">
    <div class="w-full" ref="widgetHost"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { callAdminForthApi } from '@/utils';
import { useCoreStore } from '@/stores/core';

const coreStore = useCoreStore();

interface Props {
  meta: {
    renderWidgetFunctionName: string;
    containerId: string;
    adapterName: string;
    siteKey: string;
    pluginInstanceId: string;
  };
  /**
   * Incremented by login page on every rejected login attempt.
   */
  failedLoginAttempts?: number;
}

const props = defineProps<Props>();

const widgetHost = ref<HTMLElement | null>(null);
const token = ref(null);
const emit = defineEmits(
  ["update:disableLoginButton"]
)
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

  emit("update:disableLoginButton", true);
  renderFn(props.meta.containerId, props.meta.siteKey, (receivedToken: string) => {
    emit("update:disableLoginButton", false);
    token.value = receivedToken;
    setJWT(receivedToken);
  });
}

async function setJWT(token: string) {
  try {
    const res = await callAdminForthApi({
      path: `/plugin/${props.meta.pluginInstanceId}/setToken`,
      method: 'POST',
      body: {
        token,
      },
    });
  } catch (error) {
    console.error('Failed to validate token:', error);
  }
}

</script>
