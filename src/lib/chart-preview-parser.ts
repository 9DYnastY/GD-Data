import { EMPTY_DTX_JSON, type DtxBar, type DtxBpmSegment, type DtxChip, type DtxJson, type DtxLine } from './chart-preview-types'

interface LaneCodeRemap {
  code: string[]
  name: string
}

interface BarLaneItem {
  barNum: number
  laneCode: string
  value: string
}

interface ChipItem {
  barNum: number
  lineNum: number
  chipCode: string
}

interface BpmMarker {
  bpm: number
  barNum: number
  lineNum: number
}

type LaneBarChipsData = Record<string, DtxChip[]>

const TITLE_TAG = '#TITLE'
const LINES_IN_1_BAR = 192

const COMMON_LANE_CODE_MAPPING: LaneCodeRemap[] = [{ code: ['01'], name: 'BGM' }]

const DTX_DRUM_LANE_CODE_MAPPING: LaneCodeRemap[] = [
  { code: ['1A'], name: 'LeftCrashCymbal' },
  { code: ['11', '18'], name: 'Hi-Hat' },
  { code: ['12'], name: 'Snare' },
  { code: ['1B'], name: 'LeftHiHatPedal' },
  { code: ['1C'], name: 'LeftBassPedal' },
  { code: ['14'], name: 'Hi-Tom' },
  { code: ['13'], name: 'RightBassPedal' },
  { code: ['15'], name: 'Low-Tom' },
  { code: ['17'], name: 'Floor-Tom' },
  { code: ['16'], name: 'RightCrashCymbal' },
  { code: ['19'], name: 'RideCymbal' },
]

const DTX_GUITAR_LANE_CODE_MAPPING: LaneCodeRemap[] = [
  { code: ['2C'], name: 'GHold' },
  { code: ['20'], name: 'G00000' },
  { code: ['21'], name: 'G00100' },
  { code: ['22'], name: 'G01000' },
  { code: ['24'], name: 'G10000' },
  { code: ['93'], name: 'G00010' },
  { code: ['9B'], name: 'G00001' },
  { code: ['23'], name: 'G01100' },
  { code: ['25'], name: 'G10100' },
  { code: ['26'], name: 'G11000' },
  { code: ['94'], name: 'G00110' },
  { code: ['95'], name: 'G01010' },
  { code: ['97'], name: 'G10010' },
  { code: ['9C'], name: 'G00101' },
  { code: ['9D'], name: 'G01001' },
  { code: ['9F'], name: 'G10001' },
  { code: ['AC'], name: 'G00011' },
  { code: ['27'], name: 'G11100' },
  { code: ['96'], name: 'G01110' },
  { code: ['98'], name: 'G10110' },
  { code: ['99'], name: 'G11010' },
  { code: ['9E'], name: 'G01101' },
  { code: ['A9'], name: 'G10101' },
  { code: ['AA'], name: 'G11001' },
  { code: ['AD'], name: 'G00111' },
  { code: ['AE'], name: 'G01011' },
  { code: ['D0'], name: 'G10011' },
  { code: ['9A'], name: 'G11110' },
  { code: ['AB'], name: 'G11101' },
  { code: ['AF'], name: 'G01111' },
  { code: ['D1'], name: 'G10111' },
  { code: ['D2'], name: 'G11011' },
  { code: ['D3'], name: 'G11111' },
  { code: ['28'], name: 'GWail' },
]

const DTX_BASS_LANE_CODE_MAPPING: LaneCodeRemap[] = [
  { code: ['2D'], name: 'BHold' },
  { code: ['A0'], name: 'B00000' },
  { code: ['A1'], name: 'B00100' },
  { code: ['A2'], name: 'B01000' },
  { code: ['A4'], name: 'B10000' },
  { code: ['C5'], name: 'B00010' },
  { code: ['CE'], name: 'B00001' },
  { code: ['A3'], name: 'B01100' },
  { code: ['A5'], name: 'B10100' },
  { code: ['A6'], name: 'B11000' },
  { code: ['C6'], name: 'B00110' },
  { code: ['C8'], name: 'B01010' },
  { code: ['CA'], name: 'B10010' },
  { code: ['CF'], name: 'B00101' },
  { code: ['DA'], name: 'B01001' },
  { code: ['DC'], name: 'B10001' },
  { code: ['E1'], name: 'B00011' },
  { code: ['A7'], name: 'B11100' },
  { code: ['C9'], name: 'B01110' },
  { code: ['CB'], name: 'B10110' },
  { code: ['CC'], name: 'B11010' },
  { code: ['DB'], name: 'B01101' },
  { code: ['DD'], name: 'B10101' },
  { code: ['DE'], name: 'B11001' },
  { code: ['E2'], name: 'B00111' },
  { code: ['E3'], name: 'B01011' },
  { code: ['E5'], name: 'B10011' },
  { code: ['CD'], name: 'B11110' },
  { code: ['DF'], name: 'B11101' },
  { code: ['E4'], name: 'B01111' },
  { code: ['E6'], name: 'B10111' },
  { code: ['E7'], name: 'B11011' },
  { code: ['E8'], name: 'B11111' },
  { code: ['A8'], name: 'BWail' },
]

const LANE_CODE_MAPPING = [
  ...COMMON_LANE_CODE_MAPPING,
  ...DTX_DRUM_LANE_CODE_MAPPING,
  ...DTX_GUITAR_LANE_CODE_MAPPING,
  ...DTX_BASS_LANE_CODE_MAPPING,
]

function cloneEmptyDtxJson(): DtxJson {
  return {
    ...EMPTY_DTX_JSON,
    songInfo: { ...EMPTY_DTX_JSON.songInfo },
    chips: [],
    bars: [],
    quarterBarLines: [],
    bpmSegments: [],
    laneChipCounter: {},
  }
}

function compareBarLine(a: Pick<BpmMarker, 'barNum' | 'lineNum'>, b: Pick<BpmMarker, 'barNum' | 'lineNum'>) {
  return a.barNum === b.barNum ? a.lineNum - b.lineNum : a.barNum - b.barNum
}

function parseTag(content: string, fieldName: string) {
  const pattern = new RegExp(`^#${fieldName}(?::|\\s)\\s*(.*)$`, 'im')
  return pattern.exec(content)?.[1]?.trim() ?? ''
}

function splitLineData(inputLine: string): BarLaneItem | null {
  const match = /^#(\d{3})([A-Z0-9]{2})(?::|\s)\s*(\S+)/i.exec(inputLine.trim())

  if (!match) {
    return null
  }

  return {
    barNum: Number(match[1]),
    laneCode: match[2]?.toUpperCase() ?? '',
    value: match[3]?.trim() ?? '',
  }
}

function decodeBarItem(encodedValue: string, barLength: number, barNum: number): ChipItem[] {
  const chips = encodedValue.match(/.{1,2}/g) ?? []
  const totalLineCount = LINES_IN_1_BAR * barLength

  return chips.flatMap((chipCode, index) => {
    if (chipCode === '00') {
      return []
    }

    return [{
      barNum,
      lineNum: (index * totalLineCount) / chips.length,
      chipCode,
    }]
  })
}

function convertDtxDiffLevelToGitadoraLevel(inputValue: string) {
  let diffNumber = Number.parseInt(inputValue, 10) || 0

  if (diffNumber >= 100) {
    diffNumber /= 100
  } else {
    diffNumber /= 10
  }

  return diffNumber
}

function isPlayableGuitarBassLane(laneType: string, prefix: 'G' | 'B') {
  return laneType.startsWith(prefix) && laneType !== `${prefix}Hold` && laneType !== `${prefix}Wail`
}

function isOpenLane(laneType: string) {
  return laneType === 'G00000' || laneType === 'B00000'
}

export class DtxFileParser {
  private readonly finalJson: DtxJson = cloneEmptyDtxJson()
  private barLengths: number[] = []
  private bpmMarkers: BpmMarker[] = []
  private laneBarChipsArray: LaneBarChipsData[] = []
  private errorMessage = ''

  constructor(inputContent: string) {
    if (!inputContent.includes(TITLE_TAG)) {
      this.errorMessage = 'DTX file has no #TITLE tag.'
      return
    }

    try {
      const highestBarNumber = this.extractHighestBarNumber(inputContent)
      this.barLengths = this.extractBarLengths(inputContent, highestBarNumber)
      this.bpmMarkers = this.extractBpmMarkers(inputContent)

      if (!this.bpmMarkers.length || !Number.isFinite(this.bpmMarkers[0]?.bpm)) {
        this.errorMessage = 'DTX file has no valid #BPM tag.'
        return
      }

      const songDuration = this.calculateAbsoluteTime(highestBarNumber + 1, 0)
      this.finalJson.songInfo.title = parseTag(inputContent, 'TITLE')
      this.finalJson.songInfo.artist = parseTag(inputContent, 'ARTIST')
      this.finalJson.songInfo.comment = parseTag(inputContent, 'COMMENT')
      this.finalJson.songInfo.difficultyLevelDrum = convertDtxDiffLevelToGitadoraLevel(parseTag(inputContent, 'DLEVEL'))
      this.finalJson.songInfo.difficultyLevelGuitar = convertDtxDiffLevelToGitadoraLevel(parseTag(inputContent, 'GLEVEL'))
      this.finalJson.songInfo.difficultyLevelBass = convertDtxDiffLevelToGitadoraLevel(parseTag(inputContent, 'BLEVEL'))
      this.finalJson.songInfo.songDuration = songDuration
      this.finalJson.bars = this.createBarDataArray()
      this.finalJson.bpmSegments = this.createBpmSegmentArray(songDuration)
      this.finalJson.quarterBarLines = this.createQuarterBarLineArray(this.finalJson.bars)
      this.laneBarChipsArray = this.extractAndCreateLaneChipsArray(inputContent, highestBarNumber)
      this.findHoldNotesMatches(this.laneBarChipsArray)
      this.finalJson.songInfo.noteCountDrum = this.computeNoteCountDrum()
      this.finalJson.songInfo.noteCountGuitar = this.computeNoteCountGuitar()
      this.finalJson.songInfo.noteCountBass = this.computeNoteCountBass()
      this.finalJson.chips = this.flattenAllChipsIntoSingleArray(this.laneBarChipsArray)
    } catch (error) {
      this.errorMessage = error instanceof Error ? error.message : 'DTX parsing failed.'
    }
  }

  public getDtxJson() {
    return this.finalJson
  }

  public getErrorMessage() {
    return this.errorMessage
  }

  private computeNoteCountDrum() {
    return [
      'LeftCrashCymbal',
      'Hi-Hat',
      'Snare',
      'LeftBassPedal',
      'LeftHiHatPedal',
      'Hi-Tom',
      'RightBassPedal',
      'Low-Tom',
      'Floor-Tom',
      'RightCrashCymbal',
      'RideCymbal',
    ].reduce((count, laneType) => count + (this.finalJson.laneChipCounter[laneType] ?? 0), 0)
  }

  private computeNoteCountGuitar() {
    return DTX_GUITAR_LANE_CODE_MAPPING.reduce((count, lane) => {
      return isPlayableGuitarBassLane(lane.name, 'G') ? count + (this.finalJson.laneChipCounter[lane.name] ?? 0) : count
    }, 0)
  }

  private computeNoteCountBass() {
    return DTX_BASS_LANE_CODE_MAPPING.reduce((count, lane) => {
      return isPlayableGuitarBassLane(lane.name, 'B') ? count + (this.finalJson.laneChipCounter[lane.name] ?? 0) : count
    }, 0)
  }

  private accumulateCountForLaneChips(laneName: string, count: number) {
    this.finalJson.laneChipCounter[laneName] = (this.finalJson.laneChipCounter[laneName] ?? 0) + count
  }

  private extractHighestBarNumber(dtxContent: string) {
    let highestBarNumber = 0
    const linePattern = /^#(\d{3})(?!02)[A-Z0-9]{2}(?::|\s)\s*\S+/gim
    let match: RegExpExecArray | null

    while ((match = linePattern.exec(dtxContent)) !== null) {
      highestBarNumber = Math.max(highestBarNumber, Number(match[1]))
    }

    return highestBarNumber
  }

  private extractBarLengths(dtxContent: string, highestBarNumber: number) {
    const markerMap = new Map<number, number>()
    const markerPattern = /^#(\d{3})02(?::|\s)\s*(\S+)/gim
    let match: RegExpExecArray | null

    while ((match = markerPattern.exec(dtxContent)) !== null) {
      markerMap.set(Number(match[1]), Number.parseFloat(match[2] ?? '1'))
    }

    const barLengths: number[] = []
    let currentBarLength = 1

    for (let barNum = 0; barNum <= highestBarNumber; barNum += 1) {
      currentBarLength = markerMap.get(barNum) ?? currentBarLength
      barLengths.push(currentBarLength)
    }

    return barLengths
  }

  private extractBpmMarkers(dtxContent: string) {
    const bpmMarkers: BpmMarker[] = []
    const startBpm = Number.parseFloat(parseTag(dtxContent, 'BPM'))

    if (Number.isFinite(startBpm) && startBpm > 0) {
      bpmMarkers.push({ bpm: startBpm, barNum: 0, lineNum: 0 })
    }

    const bpmLabelMap = new Map<string, number>()
    const bpmLabelPattern = /^#BPM([A-Z0-9]{2})(?::|\s)\s*(\S+)/gim
    let labelMatch: RegExpExecArray | null

    while ((labelMatch = bpmLabelPattern.exec(dtxContent)) !== null) {
      const label = labelMatch[1]?.toUpperCase()
      const value = Number.parseFloat(labelMatch[2] ?? '')

      if (label && Number.isFinite(value)) {
        bpmLabelMap.set(label, value)
      }
    }

    const bpmLanePattern = /^#(\d{3})08(?::|\s)\s*(\S+)/gim
    let laneMatch: RegExpExecArray | null

    while ((laneMatch = bpmLanePattern.exec(dtxContent)) !== null) {
      const barNum = Number(laneMatch[1])
      const encodedValue = laneMatch[2] ?? ''
      const barLength = this.barLengths[barNum] ?? 1

      decodeBarItem(encodedValue, barLength, barNum).forEach((chip) => {
        const bpm = bpmLabelMap.get(chip.chipCode.toUpperCase())

        if (!Number.isFinite(bpm)) {
          return
        }

        if (chip.barNum === 0 && chip.lineNum === 0 && bpmMarkers[0]) {
          bpmMarkers[0].bpm = bpm as number
          return
        }

        bpmMarkers.push({
          bpm: bpm as number,
          barNum: chip.barNum,
          lineNum: chip.lineNum,
        })
      })
    }

    return bpmMarkers.sort(compareBarLine)
  }

  private calculateAbsoluteTime(barNum: number, line: number) {
    if (barNum < 0 || line < 0 || !this.bpmMarkers[0]) {
      return 0
    }

    let currentBpm = this.bpmMarkers[0].bpm
    let markerIndex = 1
    let currentTime = 0

    for (let index = 0; index <= barNum; index += 1) {
      const currentBarLength = this.barLengths[index] ?? 1
      const currentBarLineCount = currentBarLength * LINES_IN_1_BAR
      const currentLineUpperBound = index === barNum ? Math.min(line, currentBarLineCount) : currentBarLineCount
      let currentLineNum = 0

      while (
        markerIndex < this.bpmMarkers.length
        && this.bpmMarkers[markerIndex]?.barNum === index
        && (this.bpmMarkers[markerIndex]?.lineNum ?? Number.POSITIVE_INFINITY) <= currentLineUpperBound
      ) {
        const marker = this.bpmMarkers[markerIndex] as BpmMarker
        currentTime += (marker.lineNum - currentLineNum) * (1.25 / currentBpm)
        currentBpm = marker.bpm
        currentLineNum = marker.lineNum
        markerIndex += 1
      }

      currentTime += (currentLineUpperBound - currentLineNum) * (1.25 / currentBpm)
    }

    return currentTime
  }

  private createBarDataArray() {
    const bars: DtxBar[] = []
    const arraySize = this.barLengths.length + 1

    for (let index = 0; index < arraySize; index += 1) {
      const currentBarData: DtxBar = {
        lineCount: index < arraySize - 1 ? (this.barLengths[index] ?? 1) * LINES_IN_1_BAR : 0,
        startTimePos: this.calculateAbsoluteTime(index, 0),
        duration: 0,
      }

      if (index > 0 && bars[index - 1]) {
        bars[index - 1].duration = currentBarData.startTimePos - bars[index - 1].startTimePos
      }

      if (index < arraySize - 1) {
        bars.push(currentBarData)
      }
    }

    return bars
  }

  private createBpmSegmentArray(songDuration: number) {
    const bpmSegments: DtxBpmSegment[] = []

    this.bpmMarkers.forEach((bpmMarker, index) => {
      const currentSegment: DtxBpmSegment = {
        bpm: bpmMarker.bpm,
        startBarNum: bpmMarker.barNum,
        startLineNum: bpmMarker.lineNum,
        startTimePos: this.calculateAbsoluteTime(bpmMarker.barNum, bpmMarker.lineNum),
        duration: 0,
      }

      if (index > 0 && bpmSegments[index - 1]) {
        bpmSegments[index - 1].duration = currentSegment.startTimePos - bpmSegments[index - 1].startTimePos
      }

      if (index === this.bpmMarkers.length - 1) {
        currentSegment.duration = songDuration - currentSegment.startTimePos
      }

      bpmSegments.push(currentSegment)
    })

    return bpmSegments
  }

  private createQuarterBarLineArray(bars: DtxBar[]) {
    const quarterBarLines: DtxLine[] = []

    bars.forEach((bar, barNumber) => {
      const numQuarterLines = Math.floor(bar.lineCount / (LINES_IN_1_BAR / 4))

      for (let index = 0; index < numQuarterLines; index += 1) {
        const lineNumberInBar = index * (LINES_IN_1_BAR / 4)
        quarterBarLines.push({
          barNumber,
          lineNumberInBar,
          timePosition: this.calculateAbsoluteTime(barNumber, lineNumberInBar),
        })
      }
    })

    return quarterBarLines
  }

  private extractAndCreateLaneChipsArray(dtxContent: string, highestBarNumber: number) {
    const barChipsArray: LaneBarChipsData[] = []

    for (let barNum = 0; barNum <= highestBarNumber; barNum += 1) {
      const currentBarChips: LaneBarChipsData = {}

      LANE_CODE_MAPPING.forEach((lane) => {
        const chips = this.extractChipsFromLaneInBar(dtxContent, barNum, lane)
        currentBarChips[lane.name] = chips
        this.accumulateCountForLaneChips(lane.name, chips.length)
      })

      barChipsArray.push(currentBarChips)
    }

    return barChipsArray
  }

  private extractChipsFromLaneInBar(dtxContent: string, barNum: number, lane: LaneCodeRemap) {
    const chips: DtxChip[] = []
    const barNumToken = String(barNum).padStart(3, '0')

    lane.code.forEach((laneCode) => {
      const linePattern = new RegExp(`^#${barNumToken}${laneCode}(?::|\\s)\\s*\\S+`, 'gim')
      let match: RegExpExecArray | null

      while ((match = linePattern.exec(dtxContent)) !== null) {
        const decodedLine = splitLineData(match[0])

        if (!decodedLine) {
          continue
        }

        decodeBarItem(decodedLine.value, this.barLengths[decodedLine.barNum] ?? 1, decodedLine.barNum).forEach((chip) => {
          chips.push({
            lineTimePosition: {
              barNumber: chip.barNum,
              lineNumberInBar: chip.lineNum,
              timePosition: this.calculateAbsoluteTime(chip.barNum, chip.lineNum),
            },
            chipCode: chip.chipCode,
            laneType: lane.name,
          })
        })
      }
    })

    return chips.sort((a, b) => a.lineTimePosition.lineNumberInBar - b.lineTimePosition.lineNumberInBar)
  }

  private findHoldNotesMatches(laneBarChipsDataArray: LaneBarChipsData[]) {
    let currentGuitarHoldChip: DtxChip | undefined
    let currentBassHoldChip: DtxChip | undefined

    laneBarChipsDataArray.forEach((laneBarChips, barIndex) => {
      currentGuitarHoldChip = this.processHoldNotesInBar('G', laneBarChips, barIndex, currentGuitarHoldChip)
      currentBassHoldChip = this.processHoldNotesInBar('B', laneBarChips, barIndex, currentBassHoldChip)
    })
  }

  private searchForGuitarBassChip(
    laneBarChips: LaneBarChipsData,
    chipToMatch: DtxChip,
    prefix: 'G' | 'B',
    searchInAscendingOrder: boolean,
    compareLine: (chipLine: number, targetLine: number) => boolean,
  ) {
    for (const laneType of Object.keys(laneBarChips)) {
      if (!isPlayableGuitarBassLane(laneType, prefix)) {
        continue
      }

      const chips = laneBarChips[laneType] ?? []
      const startIndex = searchInAscendingOrder ? 0 : chips.length - 1
      const endIndex = searchInAscendingOrder ? chips.length : -1
      const step = searchInAscendingOrder ? 1 : -1

      for (let index = startIndex; index !== endIndex; index += step) {
        const chip = chips[index]

        if (!chip || chip.lineTimePosition.barNumber !== chipToMatch.lineTimePosition.barNumber) {
          continue
        }

        if (compareLine(chip.lineTimePosition.lineNumberInBar, chipToMatch.lineTimePosition.lineNumberInBar)) {
          return chip
        }
      }
    }

    return undefined
  }

  private processHoldNotesInBar(
    prefix: 'G' | 'B',
    laneBarChips: LaneBarChipsData,
    barIndex: number,
    currentHoldChip: DtxChip | undefined,
  ) {
    let activeHoldChip = currentHoldChip
    const holdMarkers = laneBarChips[`${prefix}Hold`] ?? []

    holdMarkers.forEach((holdMarker) => {
      if (!activeHoldChip) {
        const startChip = this.searchForGuitarBassChip(
          laneBarChips,
          holdMarker,
          prefix,
          true,
          (chipLine, markerLine) => chipLine === markerLine,
        )

        if (startChip && !isOpenLane(startChip.laneType)) {
          activeHoldChip = startChip
        }

        return
      }

      const nearestChipBeforeEnd = this.searchForGuitarBassChip(
        laneBarChips,
        holdMarker,
        prefix,
        false,
        (chipLine, markerLine) => chipLine <= markerLine,
      )
      const isSameAsStartChip = nearestChipBeforeEnd
        && nearestChipBeforeEnd.lineTimePosition.barNumber === activeHoldChip.lineTimePosition.barNumber
        && nearestChipBeforeEnd.lineTimePosition.lineNumberInBar === activeHoldChip.lineTimePosition.lineNumberInBar

      if (!nearestChipBeforeEnd || isSameAsStartChip) {
        activeHoldChip.endLineTimePosition = { ...holdMarker.lineTimePosition }
      }

      activeHoldChip = undefined
    })

    if (!activeHoldChip) {
      return undefined
    }

    let chipToMatch: DtxChip = {
      lineTimePosition: { barNumber: barIndex, lineNumberInBar: 0, timePosition: 0 },
      chipCode: '01',
      laneType: 'Bar',
    }
    let compareLine = (chipLine: number, targetLine: number) => chipLine >= targetLine

    if (activeHoldChip.lineTimePosition.barNumber === barIndex) {
      chipToMatch = activeHoldChip
      compareLine = (chipLine: number, targetLine: number) => chipLine > targetLine
    }

    const chipAfterStartBeforeEnd = this.searchForGuitarBassChip(
      laneBarChips,
      chipToMatch,
      prefix,
      true,
      compareLine,
    )

    return chipAfterStartBeforeEnd ? undefined : activeHoldChip
  }

  private flattenAllChipsIntoSingleArray(laneBarChipsDataArray: LaneBarChipsData[]) {
    return laneBarChipsDataArray.flatMap((laneBarChips) => Object.values(laneBarChips).flat())
  }
}
