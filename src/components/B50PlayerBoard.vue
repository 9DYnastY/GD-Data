<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'
import skillIconSrc from '../assets/skill-page/Player_Board/Skill_icon.svg'
import { resolveSkillToneStyle, splitSkillValueText } from '../lib/skill-tone'

const props = defineProps<{
  displayName: string
  title: string
  skillValue: string
  nameToneStyle?: CSSProperties | null
}>()

const skillToneStyle = computed(() => resolveSkillToneStyle(props.skillValue))
const nameToneStyle = computed(() => props.nameToneStyle ?? skillToneStyle.value)
const skillValueParts = computed(() => splitSkillValueText(props.skillValue))
</script>

<template>
  <article class="b50-player-board">
    <svg
      class="b50-player-board__background"
      viewBox="0 0 534 201"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <rect
        x="1.45"
        y="1.45"
        width="531.1"
        height="197.9"
        fill="#5229C0"
        fill-opacity="0.8"
        stroke="#2F00B2"
        stroke-width="2.9"
      />
      <path d="M532 22V2.5H513L532 22Z" fill="#FF6D00" />
      <path d="M2.5 177.5V198H21.5L2.5 177.5Z" fill="#FF6D00" />
    </svg>

    <div class="b50-player-board__player-info">
      <p class="b50-player-board__title">{{ props.title || 'NO TITLE' }}</p>
      <h2
        class="b50-player-board__name"
        :title="props.displayName"
        :style="nameToneStyle"
      >
        {{ props.displayName || 'NO NAME' }}
      </h2>
    </div>

    <div class="b50-player-board__divider" aria-hidden="true"></div>

    <div class="b50-player-board__skill">
      <img class="b50-player-board__skill-icon" :src="skillIconSrc" alt="" aria-hidden="true" />
      <strong class="b50-player-board__skill-value" :style="skillToneStyle">
        <span class="b50-player-board__skill-whole">{{ skillValueParts.whole }}</span>
        <span
          v-if="skillValueParts.fraction"
          class="b50-player-board__skill-fraction"
        >
          {{ skillValueParts.fraction }}
        </span>
      </strong>
    </div>
  </article>
</template>

<style scoped>
.b50-player-board {
  position: relative;
  width: 534px;
  height: 201px;
  overflow: hidden;
}

.b50-player-board__background,
.b50-player-board__player-info,
.b50-player-board__divider,
.b50-player-board__skill {
  position: absolute;
}

.b50-player-board__background {
  inset: 0;
  width: 100%;
  height: 100%;
}

.b50-player-board__player-info {
  top: 9px;
  left: 24px;
  width: 370px;
}

.b50-player-board__title {
  margin: 0 0 16px;
  overflow: hidden;
  color: #f8f8f8;
  font-family: var(--font-figma-title);
  font-size: 28.84px;
  font-weight: 400;
  letter-spacing: 0.73px;
  line-height: 28px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.b50-player-board__name {
  margin: 0;
  overflow: hidden;
  font-family: var(--font-figma-title);
  font-size: 43.3px;
  font-weight: 500;
  letter-spacing: 0.73px;
  line-height: 43px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.b50-player-board__divider {
  top: 115px;
  left: 21px;
  width: 496px;
  height: 1px;
  background: rgba(255, 255, 255, 0.5);
}

.b50-player-board__skill {
  top: 123px;
  left: 138px;
  display: flex;
  align-items: baseline;
  gap: 18px;
}

.b50-player-board__skill-icon {
  width: 175px;
  height: auto;
  flex: none;
  object-fit: contain;
}

.b50-player-board__skill-value {
  display: inline-flex;
  align-items: baseline;
  font-family: var(--font-figma-ui);
  font-weight: 500;
  line-height: 0.92;
  letter-spacing: -3.6px;
  white-space: nowrap;
}

.b50-player-board__skill-whole {
  font-size: 62px;
}

.b50-player-board__skill-fraction {
  margin-left: 2px;
  font-size: 48px;
  letter-spacing: -2.4px;
}
</style>
