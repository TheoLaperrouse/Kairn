/** Status bar colour of the installed app, matching each theme's background. */
const THEME_COLORS = { dark: '#0b1424', light: '#f5f2ec' } as const

/** Applies a theme chosen by hand, overriding the system preference (status bar included). */
export function applyTheme(theme: keyof typeof THEME_COLORS): void {
  document.documentElement.dataset.theme = theme
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) meta.content = THEME_COLORS[theme]
}
