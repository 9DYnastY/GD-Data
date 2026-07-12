import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/lib/bjmania/recent-history.ts', import.meta.url),
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
  createRecentPlayHistoryId,
  normalizeRecentPlayHistoryRecords,
} = await import(moduleUrl)

function recentPlay(overrides = {}) {
  return {
    format: 'gitadora',
    content: '{"MusicId":1001}',
    timestamp: 1_700_000_000,
    comment: '',
    payload: {
      MusicId: 1001,
      GameSpec: 1,
      Seq: 4,
      GitadoraVersion: 11,
      Score: 950000,
    },
    ...overrides,
  }
}

test('builds a stable play id from account, time, song, game spec, and sequence', () => {
  const original = recentPlay()
  const corrected = recentPlay({
    content: '{"MusicId":1001,"Score":960000}',
    comment: 'updated',
    payload: { ...original.payload, Score: 960000 },
  })

  assert.equal(
    createRecentPlayHistoryId('user-a', original),
    createRecentPlayHistoryId('user-a', corrected),
  )
  assert.notEqual(
    createRecentPlayHistoryId('user-a', original),
    createRecentPlayHistoryId('user-a', recentPlay({ payload: { ...original.payload, Seq: 3 } })),
  )
  assert.notEqual(
    createRecentPlayHistoryId('user-a', original),
    createRecentPlayHistoryId('user-b', original),
  )
})

test('uses a deterministic fallback id for incomplete upstream records', () => {
  const incomplete = recentPlay({ payload: null, timestamp: 0, content: 'raw payload' })

  assert.equal(
    createRecentPlayHistoryId('user-a', incomplete),
    createRecentPlayHistoryId('user-a', { ...incomplete }),
  )
  assert.notEqual(
    createRecentPlayHistoryId('user-a', incomplete),
    createRecentPlayHistoryId('user-a', { ...incomplete, content: 'different payload' }),
  )
})

test('normalizes family metadata and removes duplicates within one response', () => {
  const first = recentPlay()
  const corrected = recentPlay({
    comment: 'latest',
    payload: { ...first.payload, Score: 970000 },
  })
  const guitar = recentPlay({
    timestamp: first.timestamp + 300,
    payload: {
      ...first.payload,
      GameSpec: '0',
      Seq: '6',
      MusicId: '1002',
    },
  })
  const records = normalizeRecentPlayHistoryRecords(
    'user-a',
    [first, corrected, guitar],
    1234,
  )

  assert.equal(records.length, 2)
  assert.equal(records[0].family, 'dm')
  assert.equal(records[0].comment, 'latest')
  assert.equal(records[0].capturedAt, 1234)
  assert.equal(records[0].lastSeenAt, 1234)
  assert.equal(records[1].family, 'gf')
  assert.equal(records[1].musicId, 1002)
  assert.equal(records[1].seq, 6)
})
