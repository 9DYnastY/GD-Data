import { normalizeSong } from './song-normalizer'
import type { SongCatalogResponse, SongViewModel } from '../types/song'

let catalogPromise: Promise<SongViewModel[]> | null = null

async function fetchCatalog(): Promise<SongCatalogResponse> {
  const response = await fetch('/M32_mdb_11_merged_remy.json')

  if (!response.ok) {
    throw new Error(`无法加载曲库数据：${response.status}`)
  }

  return (await response.json()) as SongCatalogResponse
}

export function loadSongCatalog(): Promise<SongViewModel[]> {
  if (!catalogPromise) {
    catalogPromise = fetchCatalog().then((payload) =>
      payload.mdb_data.map((song, index) => normalizeSong(song, index)),
    )
  }

  return catalogPromise
}

export async function loadSongByMusicId(musicId: number): Promise<SongViewModel | undefined> {
  const songs = await loadSongCatalog()
  return songs.find((song) => song.musicId === musicId)
}
