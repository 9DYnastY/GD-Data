import { createApp } from 'vue'
import App from './App.vue'
import { preloadDtxChartManifest } from './lib/chart-preview-manifest'
import { installPressFeedback } from './lib/press-feedback'
import router from './router'
import './style.css'

installPressFeedback()
preloadDtxChartManifest()

createApp(App).use(router).mount('#app')
