import { createRouter, createWebHistory } from 'vue-router';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/analysis' },
    { path: '/analysis', name: 'analysis', component: () => import('../views/ReleaseAnalysisView.vue') },
    { path: '/services', name: 'services', component: () => import('../views/ServicesView.vue') },
    { path: '/logs', name: 'logs', component: () => import('../views/LogsView.vue') },
    { path: '/members', name: 'members', component: () => import('../views/MembersView.vue') },
    { path: '/settings', name: 'base-config', component: () => import('../views/SettingsView.vue') },
    {
      path: '/workspace-settings',
      name: 'workspace-settings',
      component: () => import('../views/WorkspaceSettingsView.vue'),
    },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('../views/NotFoundView.vue') },
  ],
});
