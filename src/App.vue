<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
</script>

<template>
  <div class="shell">
    <header class="shell-header">
      <div class="shell-header__inner">
        <RouterLink class="brand" to="/">
          <span class="brand__eyebrow">GITADORA Song Browser</span>
          <span class="brand__title">Catalog Explorer</span>
        </RouterLink>
        <p class="brand__meta">Home list / filter drawer / song detail</p>
      </div>
    </header>
    <main class="shell-main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
}

.shell-header {
  position: sticky;
  top: 0;
  z-index: 20;
  backdrop-filter: blur(20px);
  background:
    linear-gradient(180deg, rgba(251, 247, 239, 0.94), rgba(251, 247, 239, 0.8));
  border-bottom: 1px solid rgba(31, 41, 55, 0.08);
}

.shell-header__inner,
.shell-main {
  width: min(1100px, calc(100vw - 32px));
  margin: 0 auto;
}

.shell-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
}

.brand {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  text-decoration: none;
}

.brand__eyebrow {
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.brand__title {
  color: var(--ink);
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: -0.03em;
}

.brand__meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.94rem;
}

.shell-main {
  padding: 28px 0 48px;
}

@media (max-width: 720px) {
  .shell-header__inner {
    flex-direction: column;
    align-items: flex-start;
  }

  .brand__meta {
    font-size: 0.86rem;
  }

  .shell-main {
    padding-top: 20px;
  }
}
</style>
