import type { BjmaniaScoreFamily, BjmaniaScoreListItem } from '../types/bjmania'
import { rawSkillToText } from './bjmania/client'

const FIGMA_CARD_WIDTH = 240.311

const B50_CARD_WIDTH = 208
const B50_POSTER_SCALE = B50_CARD_WIDTH / FIGMA_CARD_WIDTH
export const B50_POSTER_WIDTH = Math.round(3186 * B50_POSTER_SCALE)
export const B50_POSTER_HEIGHT = Math.round(2136 * B50_POSTER_SCALE)

export function getB50RowKey(row: BjmaniaScoreListItem) {
  return [
    row.musicId,
    row.family,
    row.instrument,
    row.level,
    row.branchLabel ?? 'main',
  ].join(':')
}

function sortB50Rows(rows: BjmaniaScoreListItem[]) {
  return rows
    .slice()
    .sort((left, right) => right.skillCalcRaw - left.skillCalcRaw || left.musicId - right.musicId)
}

export function selectB50BucketRows(
  rows: BjmaniaScoreListItem[],
  family: BjmaniaScoreFamily,
  isHot: boolean,
) {
  return sortB50Rows(
    rows.filter((row) => row.family === family && row.isHot === isHot && row.inSkill),
  ).slice(0, 25)
}

export function formatB50SkillTotal(rows: BjmaniaScoreListItem[]) {
  const total = rows.reduce((sum, row) => sum + row.skillCalcRaw, 0)
  return rawSkillToText(total)
}
