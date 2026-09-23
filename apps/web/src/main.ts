import { createApp } from 'vue';
import 'element-plus/es/components/message/style/css';
import 'element-plus/es/components/message-box/style/css';
import './styles.css';
import './styles/auth.css';
import App from './App.vue';
import { router } from './router';

createApp(App).use(router).mount('#app');
