import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/lib/chart-preview-loop.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const moduleUrl = `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
const {
  clampPlaybackLoopRange,
  resolvePlaybackLoopRange,
  resolvePlaybackLoopSeekTime,
} = await import(moduleUrl)

test('normalizes A-B bookmarks, including an A point at zero', () => {
  assert.deepEqual(resolvePlaybackLoopRange([8, 0]), { startTime: 0, endTime: 8 })
  assert.deepEqual(resolvePlaybackLoopRange([8, 3]), { startTime: 3, endTime: 8 })
  assert.equal(resolvePlaybackLoopRange([3]), null)
  assert.equal(resolvePlaybackLoopRange([3, 3]), null)
  assert.equal(resolvePlaybackLoopRange([3, Number.NaN]), null)
  assert.equal(resolvePlaybackLoopRange([3, Number.POSITIVE_INFINITY]), null)
})

test('clamps the loop to a shorter active audio timeline', () => {
  assert.deepEqual(
    clampPlaybackLoopRange({ startTime: 3, endTime: 12 }, 10),
    { startTime: 3, endTime: 10 },
  )
  assert.equal(clampPlaybackLoopRange({ startTime: 12, endTime: 15 }, 10), null)
  assert.equal(clampPlaybackLoopRange({ startTime: 3, endTime: 8 }, 0), null)
})

test('seeks to A only while playback is outside the A-B range', () => {
  const range = { startTime: 3, endTime: 8 }

  assert.equal(resolvePlaybackLoopSeekTime(2.9, range), 3)
  assert.equal(resolvePlaybackLoopSeekTime(3, range), null)
  assert.equal(resolvePlaybackLoopSeekTime(7.9, range), null)
  assert.equal(resolvePlaybackLoopSeekTime(8, range), 3)
  assert.equal(resolvePlaybackLoopSeekTime(20, range), 3)
  assert.equal(resolvePlaybackLoopSeekTime(20, null), null)
})
