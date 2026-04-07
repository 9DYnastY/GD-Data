import type { CSSProperties } from 'vue'

function buildSolidTextStyle(color: string): CSSProperties {
  return {
    background: 'none',
    color,
    WebkitTextFillColor: color,
  }
}

function buildGradientTextStyle(...stops: string[]): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, ${stops.join(', ')})`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
    WebkitTextFillColor: 'transparent',
  }
}

export function resolveSkillToneStyle(rawValue: string): CSSProperties {
  const skill = Number.parseFloat(rawValue)

  if (!Number.isFinite(skill) || skill < 1000) {
    return buildSolidTextStyle('#FFFFFF')
  }

  if (skill >= 8500) {
    return buildGradientTextStyle(
      '#68E5EB 11.5385%',
      '#8FE9BE 30.3375%',
      '#FFF53F 44.9563%',
      '#FFE74C 45.6525%',
      '#F573B4 55.0503%',
      '#FD76B9 83.6538%',
      '#36223D 100%',
    )
  }

  if (skill >= 8000) {
    return buildGradientTextStyle('#DFAE23 37.5%', '#FFFFFF 77.8846%')
  }

  if (skill >= 7500) {
    return buildGradientTextStyle('#9E9E9E 37.5%', '#FFFFFF 69.7115%')
  }

  if (skill >= 7000) {
    return buildGradientTextStyle('#B46228 37.5%', '#FFFFFF 69.7115%')
  }

  if (skill >= 6500) {
    return buildGradientTextStyle('#E60021 30.7692%', '#FFFFFF 62.5%')
  }

  if (skill >= 6000) {
    return buildSolidTextStyle('#E60021')
  }

  if (skill >= 5500) {
    return buildGradientTextStyle('#E73DEB 30.7692%', '#FFFFFF 62.5%')
  }

  if (skill >= 5000) {
    return buildSolidTextStyle('#E73DEB')
  }

  if (skill >= 4500) {
    return buildGradientTextStyle('#1E83EA 30.7692%', '#FFFFFF 62.5%')
  }

  if (skill >= 4000) {
    return buildSolidTextStyle('#1E83EA')
  }

  if (skill >= 3500) {
    return buildGradientTextStyle('#05C425 30.7692%', '#FFFFFF 62.5%')
  }

  if (skill >= 3000) {
    return buildSolidTextStyle('#05C425')
  }

  if (skill >= 2500) {
    return buildGradientTextStyle('#FCDC01 30.7692%', '#FFFFFF 62.5%')
  }

  if (skill >= 2000) {
    return buildSolidTextStyle('#FCDC01')
  }

  if (skill >= 1500) {
    return buildGradientTextStyle('#FB8529 30.7692%', '#FFFFFF 62.5%')
  }

  return buildSolidTextStyle('#FB8529')
}

export function splitSkillValueText(value: string) {
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
