/** Reads form fields bound with `:value` + `@input` / `@change`. */
export function inputValue(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

export function inputNumber(event: Event): number {
  return Number(inputValue(event))
}

/** Optional numeric field: empty → `undefined`. */
export function optionalNumber(event: Event): number | undefined {
  const raw = inputValue(event)
  return raw === '' ? undefined : Number(raw)
}

export function inputChecked(event: Event): boolean {
  return (event.target as HTMLInputElement).checked
}
