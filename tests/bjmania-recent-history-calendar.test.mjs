import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/lib/bjmania/recent-history-calendar.ts', import.meta.url),
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
  buildCalendarMonthCells,
  formatLocalDateKey,
  getLocalDateRange,
  getLocalMonthRange,
  shiftCalendarMonth,
} = await import(moduleUrl)

test('builds a Monday-first calendar grid including leap days', () => {
  const cells = buildCalendarMonthCells(2024, 1)
  const populated = cells.filter((cell) => cell.dateKey)

  assert.equal(cells.length, 35)
  assert.equal(cells[3].dateKey, '2024-02-01')
  assert.equal(populated.length, 29)
  assert.equal(populated.at(-1).dateKey, '2024-02-29')
})

test('moves between calendar years without invalid months', () => {
  assert.deepEqual(shiftCalendarMonth(2025, 11, 1), { year: 2026, month: 0 })
  assert.deepEqual(shiftCalendarMonth(2026, 0, -1), { year: 2025, month: 11 })
})

test('creates valid local day and month ranges', () => {
  const day = getLocalDateRange('2026-07-11')
  const month = getLocalMonthRange(2026, 6)

  assert.ok(day)
  assert.equal(formatLocalDateKey(day.startTime), '2026-07-11')
  assert.ok(day.endTime > day.startTime)
  assert.ok(month.endTime > month.startTime)
  assert.equal(getLocalDateRange('2026-02-31'), null)
})
