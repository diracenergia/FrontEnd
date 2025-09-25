// src/loader.ts
type ModuleApp = { name: string; type: 'module'; url: string; mount: string; props?: any };
type WCApp     = { name: string; type: 'webcomponent'; url: string; tag: string; mount?: string; props?: any };
type IFrameApp = { name: string; type: 'iframe'; url: string; mount: string; allow?: string; sandbox?: string };
type App = ModuleApp | WCApp | IFrameApp;

let autoHeightInstalled = false;
function installAutoHeightListener() {
  if (autoHeightInstalled) return;
  autoHeightInstalled = true;

  window.addEventListener('message', (e) => {
    const data = e.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'EMBED_HEIGHT') return;

    const h = Math.max(0, Math.ceil(Number(data.height) || 0));
    if (!h) return;

    // Encontrar el iframe que emitió el mensaje
    const frame = Array.from(document.querySelectorAll('iframe'))
      .find((f) => (f as HTMLIFrameElement).contentWindow === e.source) as HTMLIFrameElement | undefined;

    if (frame) {
      frame.style.height = `${h}px`;
      frame.style.maxHeight = 'none';
      frame.style.overflow = 'hidden';     // evita scroll del frame
    }
  });
}

export async function loadApps(manifestUrl: string, shellApi: Record<string, any> = {}) {
  installAutoHeightListener(); // <- importante

  const res = await fetch(manifestUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No pude cargar el manifest: ${res.status}`);
  const apps: App[] = await res.json();

  for (const app of apps) {
    try {
      if (app.type === 'module') {
        const mod = await import(/* @vite-ignore */ app.url);
        const mountEl = document.querySelector((app as ModuleApp).mount)!;
        await mod.mount?.(mountEl, { shellApi, ...(app as ModuleApp).props });
      } else if (app.type === 'webcomponent') {
        await loadScript((app as WCApp).url, 'module');
        const host = document.querySelector((app as WCApp).mount ?? 'body')!;
        const el = document.createElement((app as WCApp).tag);
        Object.assign(el, (app as WCApp).props || {});
        host.appendChild(el);
      } else if (app.type === 'iframe') {
        const { url, mount, allow, sandbox } = app as IFrameApp;
        const mountEl = document.querySelector(mount)!;
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allow = allow ?? '';
        iframe.sandbox = sandbox ?? 'allow-scripts allow-forms allow-same-origin';
        iframe.style.cssText = 'border:0;width:100%;display:block;height:1px;overflow:hidden;'; // altura inicial mínima
        iframe.addEventListener('load', () => console.log(`[shell] ${app.name} iframe load OK`));
        mountEl.appendChild(iframe);
      }
      console.log(`[shell] ${app.name} cargada`);
    } catch (err) {
      console.error(`[shell] error cargando ${app.name}`, err);
    }
  }
}

function loadScript(src: string, type: 'module' | 'text/javascript' = 'module') {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.type = type;
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(s);
  });
}
