import { createRouter, createWebHistory } from 'vue-router'

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
      path: '/song/:musicId',
      name: 'song-detail',
      component: () => import('../views/SongDetailView.vue'),
      props: true,
    },
  ],
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    return { top: 0 }
  },
})

export default router
