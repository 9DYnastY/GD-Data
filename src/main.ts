import { createApp } from 'vue'
import App from './App.vue'
import { installPressFeedback } from './lib/press-feedback'
import router from './router'
import './style.css'

installPressFeedback()

createApp(App).use(router).mount('#app')
