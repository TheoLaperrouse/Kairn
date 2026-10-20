import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

/** Element width tracked on resize, even if the element only appears after mounting. */
export function useElementWidth(target: Ref<HTMLElement | undefined>, fallback = 640, min = 240): Ref<number> {
  const width = ref(fallback)
  let observer: ResizeObserver | undefined
  watch(
    target,
    (element) => {
      observer?.disconnect()
      if (!element) return
      width.value = element.clientWidth || fallback
      observer = new ResizeObserver(([entry]) => {
        if (entry) width.value = Math.max(entry.contentRect.width, min)
      })
      observer.observe(element)
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(() => observer?.disconnect())
  return width
}
