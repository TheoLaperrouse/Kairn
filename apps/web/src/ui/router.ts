import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../application/stores/auth'
import { useTrainingStore } from '../application/stores/training'

declare module 'vue-router' {
  interface RouteMeta {
    /** Accessible without being logged in. */
    public?: boolean
    /** Shown without the navigation (full screen). */
    bare?: boolean
    /** Requires a generated plan (otherwise redirects to onboarding). */
    needsPlan?: boolean
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  routes: [
    { path: '/connexion', component: () => import('./views/LoginView.vue'), meta: { public: true, bare: true, title: 'Connexion' } },
    { path: '/bienvenue', component: () => import('./views/OnboardingView.vue'), meta: { bare: true, title: 'Bienvenue' } },
    { path: '/', component: () => import('./views/DashboardView.vue'), meta: { needsPlan: true, title: 'Tableau de bord' } },
    { path: '/plan', component: () => import('./views/PlanView.vue'), meta: { needsPlan: true, title: 'Plan' } },
    { path: '/course', component: () => import('./views/RaceView.vue'), meta: { needsPlan: true, title: 'Plan de course' } },
    { path: '/seance/:id', component: () => import('./views/SessionView.vue'), props: true, meta: { needsPlan: true, title: 'Séance' } },
    {
      path: '/renfo/:routineId/guidee',
      component: () => import('./views/WorkoutPlayerView.vue'),
      props: (route) => ({ routineId: route.params.routineId, sessionId: route.query.seance }),
      meta: { bare: true, title: 'Séance guidée' },
    },
    { path: '/exercices', component: () => import('./views/ExercisesView.vue'), meta: { title: 'Exercices' } },
    { path: '/exercices/:id', component: () => import('./views/ExerciseDetailView.vue'), props: true, meta: { title: 'Exercice' } },
    { path: '/activites', component: () => import('./views/ActivitiesView.vue'), meta: { title: 'Activités' } },
    { path: '/activites/:id', component: () => import('./views/ActivityDetailView.vue'), props: true, meta: { title: 'Activité' } },
    { path: '/bilan/:week?', component: () => import('./views/WeeklySummaryView.vue'), props: true, meta: { title: 'Bilan de la semaine' } },
    { path: '/nutrition', component: () => import('./views/NutritionView.vue'), meta: { title: 'Nutrition' } },
    { path: '/reglages', component: () => import('./views/SettingsView.vue'), meta: { title: 'Réglages' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.restore()
  if (!auth.user) return to.meta.public ? true : { path: '/connexion', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {} }
  if (to.meta.public) return '/'

  const training = useTrainingStore()
  await training.load()
  if (to.meta.needsPlan && !training.isOnboarded) return '/bienvenue'
  return true
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Kairn` : 'Kairn'
})
