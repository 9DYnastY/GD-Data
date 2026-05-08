import { createRouter, createWebHistory } from 'vue-router'

const INSTANT_SCROLL_CLASS = 'router-instant-scroll'

function restoreScrollInstantly(position: { left?: number; top?: number }) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return position
  }

  document.documentElement.classList.add(INSTANT_SCROLL_CLASS)
  window.setTimeout(() => {
    document.documentElement.classList.remove(INSTANT_SCROLL_CLASS)
  }, 120)

  return {
    ...position,
    behavior: 'auto' as ScrollBehavior,
  }
}

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
      meta: {
        showBottomNav: true,
      },
    },
    {
      path: '/skill',
      name: 'skill',
      component: () => import('../views/SkillView.vue'),
      meta: {
        showBottomNav: true,
      },
    },
    {
      path: '/skill/b50',
      name: 'skill-b50',
      component: () => import('../views/B50View.vue'),
    },
    {
      path: '/skill/history',
      name: 'skill-history',
      component: () => import('../views/RecentPlayHistoryView.vue'),
      meta: {
        showSharedBackground: true,
      },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
      meta: {
        showSharedBackground: true,
      },
    },
    {
      path: '/song/:musicId/chart',
      name: 'song-chart',
      component: () => import('../views/ChartPreviewView.vue'),
      props: true,
    },
    {
      path: '/song/:musicId',
      name: 'song-detail',
      component: () => import('../views/SongDetailView.vue'),
      props: true,
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return new Promise((resolve) => {
        requestAnimationFrame(() => {
          resolve(restoreScrollInstantly(savedPosition))
        })
      })
    }

    return restoreScrollInstantly({ top: 0 })
  },
})

export default router
