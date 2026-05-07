import type { InstrumentKey } from '../types/song'

const GF_LOGO_MAP: Record<number, string> = {
  0: '/version-logos/GF1.png',
  1: '/version-logos/GF2.png',
  2: '/version-logos/GF3.png',
  3: '/version-logos/GF4.png',
  4: '/version-logos/GF5.png',
  5: '/version-logos/GF6.png',
  6: '/version-logos/GF7.png',
  7: '/version-logos/GF8.png',
  8: '/version-logos/GF9.png',
  9: '/version-logos/GF10.png',
  10: '/version-logos/GF11.png',
  11: '/version-logos/GF_V.png',
  12: '/version-logos/GF_V2.png',
  13: '/version-logos/GF_V3.png',
  14: '/version-logos/GF_V4.png',
  15: '/version-logos/GF_V5.png',
  16: '/version-logos/GF_V6.png',
  17: '/version-logos/GF_XG.png',
  18: '/version-logos/GF_XG2.png',
  19: '/version-logos/GF_XG3.png',
}

const DM_LOGO_MAP: Record<number, string> = {
  0: '/version-logos/DM1.png',
  1: '/version-logos/DM2.png',
  2: '/version-logos/DM3.png',
  3: '/version-logos/DM4.png',
  4: '/version-logos/DM5.png',
  5: '/version-logos/DM6.png',
  6: '/version-logos/DM7.png',
  7: '/version-logos/DM8.png',
  8: '/version-logos/DM9.png',
  9: '/version-logos/DM10.png',
  10: '/version-logos/DM_V.png',
  11: '/version-logos/DM_V2.png',
  12: '/version-logos/DM_V3.png',
  13: '/version-logos/DM_V4.png',
  14: '/version-logos/DM_V5.png',
  15: '/version-logos/DM_V6.png',
  16: '/version-logos/DM_XG.png',
  17: '/version-logos/DM_XG2.png',
  18: '/version-logos/DM_XG3.png',
}

const GD_LOGO_MAP: Record<number, string> = {
  20: '/version-logos/GD.png',
  21: '/version-logos/GD_OverDrive.png',
  22: '/version-logos/GD_Tri-Boost.png',
  23: '/version-logos/GD_Tri-Boost_ReEVOLVE.png',
  24: '/version-logos/GD_Matixx.png',
  25: '/version-logos/GD_EXCHAIN.png',
  26: '/version-logos/GD_NEXTAGE.png',
  27: '/version-logos/GD_HIGH-VOLTAGE.png',
  28: '/version-logos/GD_FUZZ-UP.png',
  29: '/version-logos/GD_GALAXY_WAVE.png',
  30: '/version-logos/GD_GALAXY_WAVE_DELTA.png',
}

const FALLBACK_LOGO = '/version-logos/GD_GALAXY_WAVE.png'

export interface VersionLogoEntry {
  key: string
  label: string
  src: string
}

export function parseVersionKey(versionKey: string) {
  const [gfRaw, dmRaw] = versionKey.split('-')
  const gfIndex = Number(gfRaw)
  const dmIndex = Number(dmRaw)

  return {
    gfIndex: Number.isFinite(gfIndex) ? gfIndex : null,
    dmIndex: Number.isFinite(dmIndex) ? dmIndex : null,
  }
}

export function resolveInstrumentVersionLogo(versionKey: string, instrument: InstrumentKey) {
  const { gfIndex, dmIndex } = parseVersionKey(versionKey)

  if (gfIndex !== null && gfIndex >= 20) {
    return GD_LOGO_MAP[gfIndex] ?? FALLBACK_LOGO
  }

  if (instrument === 'drum') {
    return dmIndex !== null ? (DM_LOGO_MAP[dmIndex] ?? FALLBACK_LOGO) : FALLBACK_LOGO
  }

  return gfIndex !== null ? (GF_LOGO_MAP[gfIndex] ?? FALLBACK_LOGO) : FALLBACK_LOGO
}

export function resolveSongVersionLogos(versionKey: string): VersionLogoEntry[] {
  const { gfIndex, dmIndex } = parseVersionKey(versionKey)

  if (gfIndex !== null && gfIndex >= 20) {
    return [
      {
        key: `gd-${gfIndex}`,
        label: 'GITADORA',
        src: GD_LOGO_MAP[gfIndex] ?? FALLBACK_LOGO,
      },
    ]
  }

  const logos: VersionLogoEntry[] = []

  if (gfIndex !== null && GF_LOGO_MAP[gfIndex]) {
    logos.push({
      key: `gf-${gfIndex}`,
      label: 'GuitarFreaks',
      src: GF_LOGO_MAP[gfIndex],
    })
  }

  if (dmIndex !== null && DM_LOGO_MAP[dmIndex]) {
    logos.push({
      key: `dm-${dmIndex}`,
      label: 'DrumMania',
      src: DM_LOGO_MAP[dmIndex],
    })
  }

  return logos
}
