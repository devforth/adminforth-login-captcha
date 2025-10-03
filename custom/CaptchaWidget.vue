<template>

    <div :id="props.meta.containerId"></div>

</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { callAdminForthApi } from '@/utils';

interface Props {
  meta: {
    renderWidgetFunctionName: string;
    containerId: string;
    adapterName: string;
    siteKey: string;
    pluginInstanceId: string;
  };
}

const props = defineProps<Props>();

const token = ref(null);
const emit = defineEmits(
  ["update:allowLoginClick"]
)

onMounted(() => {
  const fnName = props.meta.renderWidgetFunctionName;
  
  const renderFn = (window as any)[fnName];
  if (typeof renderFn === 'function') {
    renderFn(props.meta.containerId, props.meta.siteKey, (receivedToken: string) => {
      emit("update:allowLoginClick", true);
      token.value = receivedToken;
      setJWT(receivedToken);
    });
  } else {
    console.warn(`Function ${fnName} not found on window`);
  }
});

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
