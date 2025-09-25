declare global {
  interface Window { __embedHeightInstalled?: boolean }
}

export function enableParentAutoHeight() {
  if (typeof window === 'undefined') return;
  if (window.__embedHeightInstalled) return;
  window.__embedHeightInstalled = true;

  const post = () => {
    window.parent?.postMessage(
      { type: 'EMBED_HEIGHT', height: document.documentElement.scrollHeight },
      '*'
    )
  }

  // reportes iniciales y ante cambios
  window.addEventListener('load', post)
  setTimeout(post, 0)

  const ro = new ResizeObserver(() => post())
  ro.observe(document.documentElement)

  window.addEventListener('hashchange', post)
  window.addEventListener('popstate', post)
}
