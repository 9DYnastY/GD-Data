<script setup lang="ts">
import { appToastKind, appToastMessage } from '../lib/app-toast'
</script>

<template>
  <Teleport to="body">
    <Transition name="app-toast">
      <div
        v-if="appToastMessage"
        class="app-toast"
        :class="`app-toast--${appToastKind}`"
        role="status"
        aria-live="polite"
      >
        {{ appToastMessage }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.app-toast {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + 104px);
  z-index: 140;
  width: max-content;
  max-width: calc(100% - 32px);
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(44, 28, 86, 0.94);
  color: #ffffff;
  font-family: 'Roboto', var(--font-sans);
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  pointer-events: none;
  box-shadow: 0 12px 28px rgba(31, 16, 63, 0.24);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.app-toast--success {
  background: rgba(37, 105, 49, 0.94);
}

.app-toast--error {
  background: rgba(150, 35, 31, 0.94);
}

.app-toast-enter-active,
.app-toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.app-toast-enter-from,
.app-toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>
