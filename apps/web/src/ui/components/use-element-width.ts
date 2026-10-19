import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** Largeur observée d'un élément (graphiques SVG responsifs). */
export function useElementWidth(target: Ref<HTMLElement | undefined>, fallback = 640): Ref<number> {
  const width = ref(fallback)
  let observer: ResizeObserver | undefined
  onMounted(() => {
    if (!target.value) return
    width.value = target.value.clientWidth || fallback
    observer = new ResizeObserver(([entry]) => {
      if (entry) width.value = Math.max(entry.contentRect.width, 240)
    })
    observer.observe(target.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return width
}
