import { computed, ref } from 'vue'

const SONG_FAVORITES_STORAGE_KEY = 'gddata:favorite-song-ids'

function readFavoriteMusicIds() {
  if (typeof window === 'undefined') {
    return new Set<number>()
  }

  try {
    const rawValue = window.localStorage.getItem(SONG_FAVORITES_STORAGE_KEY)
    const parsedValue = rawValue ? JSON.parse(rawValue) : []

    if (!Array.isArray(parsedValue)) {
      return new Set<number>()
    }

    return new Set(
      parsedValue
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0),
    )
  } catch {
    return new Set<number>()
  }
}

function persistFavoriteMusicIds(nextFavorites: Set<number>) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(
      SONG_FAVORITES_STORAGE_KEY,
      JSON.stringify(Array.from(nextFavorites).sort((left, right) => left - right)),
    )
  } catch {
    // Favorites are a local convenience feature; storage failures should not break the UI.
  }
}

const favoriteMusicIdSet = ref(readFavoriteMusicIds())

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === SONG_FAVORITES_STORAGE_KEY) {
      favoriteMusicIdSet.value = readFavoriteMusicIds()
    }
  })
}

export const favoriteMusicIds = computed(() => favoriteMusicIdSet.value)

export function isFavoriteMusicId(musicId: number) {
  return favoriteMusicIdSet.value.has(musicId)
}

export function setFavoriteMusicId(musicId: number, favorite: boolean) {
  if (!Number.isInteger(musicId) || musicId <= 0) {
    return false
  }

  const nextFavorites = new Set(favoriteMusicIdSet.value)

  if (favorite) {
    nextFavorites.add(musicId)
  } else {
    nextFavorites.delete(musicId)
  }

  favoriteMusicIdSet.value = nextFavorites
  persistFavoriteMusicIds(nextFavorites)

  return favorite
}

export function toggleFavoriteMusicId(musicId: number) {
  return setFavoriteMusicId(musicId, !isFavoriteMusicId(musicId))
}
