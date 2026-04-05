<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import boardBackgroundSrc from '../assets/skill-page/Player_Board/background.svg'
import b50ButtonSrc from '../assets/skill-page/Player_Board/b50_button.svg'
import logoutButtonSrc from '../assets/skill-page/Player_Board/logout_button.svg'
import skillIconSrc from '../assets/skill-page/Player_Board/Skill_icon.svg'

const BOARD_WIDTH = 263
const BOARD_HEIGHT = 202

const props = defineProps<{
  displayName: string
  title: string
  modeLabel: string
  skillValue: string
}>()

defineEmits<{
  signOut: []
}>()

const boardRoot = ref<HTMLElement | null>(null)
const boardScale = ref(1)
let boardResizeObserver: ResizeObserver | null = null

function splitSkillValue(value: string) {
  const normalized = value.trim()
  const match = normalized.match(/^([+-]?\d+)(\.\d+)?$/)

  if (!match) {
    return {
      whole: normalized || '--',
      fraction: '',
    }
  }

  return {
    whole: match[1],
    fraction: match[2] ?? '',
  }
}

const skillValueParts = computed(() => splitSkillValue(props.skillValue))

function updateBoardScale() {
  if (!boardRoot.value) {
    return
  }

  const nextScale = Math.min(boardRoot.value.clientWidth / BOARD_WIDTH, 1)
  boardScale.value = Number.isFinite(nextScale) && nextScale > 0 ? nextScale : 1
}

onMounted(() => {
  updateBoardScale()

  if (typeof ResizeObserver === 'undefined' || !boardRoot.value) {
    return
  }

  boardResizeObserver = new ResizeObserver(() => {
    updateBoardScale()
  })
  boardResizeObserver.observe(boardRoot.value)
})

onBeforeUnmount(() => {
  boardResizeObserver?.disconnect()
})
</script>

<template>
  <article ref="boardRoot" class="skill-profile-board-shell">
    <div class="skill-profile-board">
      <div
        class="skill-profile-board__stage"
        :style="{
          width: `${BOARD_WIDTH}px`,
          height: `${BOARD_HEIGHT}px`,
          transform: `scale(${boardScale})`,
        }"
      >
        <img
          class="skill-profile-board__background"
          :src="boardBackgroundSrc"
          alt=""
          aria-hidden="true"
        />

        <div class="skill-profile-board__player-info">
          <p class="skill-profile-board__title">{{ props.title || 'No title' }}</p>
          <h3 :title="props.displayName">{{ props.displayName }}</h3>
        </div>

        <div class="skill-profile-board__divider" aria-hidden="true"></div>

        <div class="skill-profile-board__skill">
          <img
            class="skill-profile-board__skill-icon"
            :src="skillIconSrc"
            alt=""
            aria-hidden="true"
          />
          <strong class="skill-profile-board__skill-value">
            <span class="skill-profile-board__skill-whole">{{ skillValueParts.whole }}</span>
            <span
              v-if="skillValueParts.fraction"
              class="skill-profile-board__skill-fraction"
            >
              {{ skillValueParts.fraction }}
            </span>
          </strong>
        </div>

        <button
          class="skill-profile-board__action skill-profile-board__action--b50"
          type="button"
          aria-label="Generate B50"
          title="Generate B50"
        >
          <img :src="b50ButtonSrc" alt="" aria-hidden="true" />
          <span>生成B50</span>
        </button>

        <button
          class="skill-profile-board__action skill-profile-board__action--logout"
          type="button"
          aria-label="Sign out"
          title="Sign out"
          @click="$emit('signOut')"
        >
          <img :src="logoutButtonSrc" alt="" aria-hidden="true" />
          <span>账号登出</span>
        </button>
      </div>
    </div>
  </article>
</template>

<style scoped>
.skill-profile-board-shell {
  position: relative;
  width: min(100%, 263px);
  aspect-ratio: 263 / 202;
  overflow: visible;
}

.skill-profile-board {
  position: absolute;
  inset: 0;
  overflow: visible;
}

.skill-profile-board__stage {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: top left;
  will-change: transform;
}

.skill-profile-board__background,
.skill-profile-board__player-info,
.skill-profile-board__divider,
.skill-profile-board__skill,
.skill-profile-board__action {
  position: absolute;
}

.skill-profile-board__background {
  top: 0;
  left: 0;
  width: 263px;
  height: 97px;
  pointer-events: none;
}

.skill-profile-board__player-info {
  top: 4px;
  left: 12px;
  width: 181px;
  height: 49px;
  overflow: hidden;
}

.skill-profile-board__title,
.skill-profile-board__player-info h3,
.skill-profile-board__skill-value {
  margin: 0;
  background: linear-gradient(180deg, #ff00bf -212.16%, #ffffff 220.27%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.skill-profile-board__title {
  position: absolute;
  top: 0;
  left: 0;
  display: flex;
  align-items: center;
  width: 181px;
  height: 17.98px;
  color: #f8f8f8;
  background: none;
  -webkit-background-clip: border-box;
  background-clip: border-box;
  -webkit-text-fill-color: #f8f8f8;
  font-family: var(--font-figma-title);
  font-size: 14.2px;
  font-weight: 400;
  line-height: 14px;
  letter-spacing: 0.36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-profile-board__player-info h3 {
  position: absolute;
  top: 17.98px;
  left: 0;
  display: flex;
  align-items: center;
  width: 181px;
  height: 30.92px;
  font-family: var(--font-figma-title);
  font-size: 21.34px;
  font-weight: 500;
  line-height: 14px;
  letter-spacing: 0.36px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-profile-board__divider {
  top: 56px;
  left: 11px;
  width: 244px;
  border-top: 0.711px solid rgba(255, 255, 255, 0.5);
}

.skill-profile-board__skill {
  top: 61.85px;
  left: 79.17px;
  width: 175.23px;
  height: 36.68px;
}

.skill-profile-board__skill-icon {
  position: absolute;
  top: -2px;
  left: -20px;
  width: 88px;
  height: auto;
}

.skill-profile-board__skill-value {
  position: absolute;
  top: 0.15px;
  left: 68.83px;
  display: flex;
  align-items: baseline;
  min-width: 109px;
  height: 31px;
  font-family: var(--font-figma-ui);
  font-size: 32px;
  font-weight: 500;
  line-height: 14px;
  letter-spacing: -2px;
  white-space: nowrap;
  font-feature-settings: 'pnum' 1, 'lnum' 1;
}

.skill-profile-board__skill-whole,
.skill-profile-board__skill-fraction {
  display: inline-block;
  line-height: 0.92;
  vertical-align: baseline;
}

.skill-profile-board__skill-fraction {
  margin-left: 1px;
  font-size: 25px;
  letter-spacing: -1.4px;
}

.skill-profile-board__action {
  display: flex;
  align-items: center;
  gap: 3px;
  width: 107px;
  height: 42px;
  padding: 0 10px 0 2px;
  border: 1.747px solid #2f00b2;
  border-radius: 10px;
  background: #5229c0;
  box-shadow: 0 14px 32px rgba(32, 9, 86, 0.22);
  cursor: pointer;
}

.skill-profile-board__action img {
  flex: none;
  width: 32px;
  height: 32px;
}

.skill-profile-board__action span {
  color: #f8f8f8;
  font-family: var(--font-figma-title);
  font-size: 16px;
  font-weight: 700;
  line-height: 17px;
  letter-spacing: 0.44px;
  white-space: nowrap;
}

.skill-profile-board__action--b50 {
  top: 107px;
  left: 155px;
}

.skill-profile-board__action--logout {
  top: 160px;
  left: 155px;
}
</style>
