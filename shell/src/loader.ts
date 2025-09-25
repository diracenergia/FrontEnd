type ModuleApp = { name: string; type: 'module'; url: string; mount: string; props?: any };
type WCApp     = { name: string; type: 'webcomponent'; url: string; tag: string; mount?: string; props?: any };
type IFrameApp = { name: string; type: 'iframe'; url: string; mount: string; allow?: string; sandbox?: string };
type App = ModuleApp | WCApp | IFrameApp;

export async function loadApps(manifestUrl: string, shellApi: Record<string, any> = {}) {
  const res = await fetch(manifestUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`No pude cargar el manifest: ${res.status}`);
  const apps: App[] = await res.json();

  for (const app of apps) {
    try {
      if (app.type === 'module') {
        const mod = await import(/* @vite-ignore */ app.url);
        const mountEl = document.querySelector((app as ModuleApp).mount);
        if (!mountEl) throw new Error(`Mount no encontrado: ${(app as ModuleApp).mount}`);
        // Convención: cada micro-app exporta mount(container, ctx)
        await mod.mount?.(mountEl, { shellApi, ...(app as ModuleApp).props });
      } else if (app.type === 'webcomponent') {
        await loadScript((app as WCApp).url, 'module');
        const host = document.querySelector((app as WCApp).mount ?? 'body');
        if (!host) throw new Error(`Mount no encontrado: ${(app as WCApp).mount}`);
        const el = document.createElement((app as WCApp).tag);
        Object.assign(el, (app as WCApp).props || {});
        host.appendChild(el); // el propio custom element se auto-inicializa en connectedCallback
      } else if (app.type === 'iframe') {
        const mountEl = document.querySelector((app as IFrameApp).mount);
        if (!mountEl) throw new Error(`Mount no encontrado: ${(app as IFrameApp).mount}`);
        const iframe = document.createElement('iframe');
        iframe.src = (app as IFrameApp).url;
        iframe.loading = 'lazy';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.allow = (app as IFrameApp).allow ?? '';
        iframe.sandbox = (app as IFrameApp).sandbox ?? 'allow-scripts allow-forms allow-same-origin';
        iframe.style.border = '0';
        iframe.style.width = '100%';
        iframe.style.minHeight = '400px';
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
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
