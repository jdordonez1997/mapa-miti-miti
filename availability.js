/* Lectura pública de estados y acceso al formulario alojado en Apps Script. */
window.Availability = (() => {
  const endpoint = String(window.GEOVISOR_CONFIG?.appsScriptUrl || '').trim();
  const deployment = endpoint.match(/^https:\/\/script\.google\.com\/macros\/s\/([a-zA-Z0-9_-]+)\/exec$/);
  const configured = Boolean(deployment);
  // La ruta directa del propietario evita depender del índice de cuenta /u/1/.
  const panelEndpoint = String(window.GEOVISOR_CONFIG?.appsScriptPanelUrl || '').trim();
  const panelDeployment = panelEndpoint.match(/^https:\/\/script\.google\.com\/a\/macros\/[a-zA-Z0-9.-]+\/s\/([a-zA-Z0-9_-]+)\/exec$/);
  const panelUrl = configured && panelDeployment?.[1] === deployment[1] ? panelEndpoint : endpoint;
  const keys = new Map();
  let updates = new Map();
  let photos = new Map();
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  async function prepare(registrations) {
    const missing = [...new Set(registrations.map(normalize))].filter(value => value && !keys.has(value));
    for (let start = 0; start < missing.length; start += 256) {
      await Promise.all(missing.slice(start, start + 256).map(async value => {
        const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
        keys.set(value, [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join(''));
      }));
    }
  }
  function refresh() {
    if (!configured) return endpoint ? Promise.reject(new Error('Revisa la URL /exec en config.js.')) : Promise.resolve();
    return new Promise((resolve, reject) => {
      const callback = 'geovisorUpdates_' + crypto.randomUUID().replace(/-/g, '');
      const script = document.createElement('script');
      let timer;
      function cleanup() { clearTimeout(timer); script.remove(); delete window[callback]; }
      window[callback] = payload => {
        cleanup();
        if (!payload?.ok || !Array.isArray(payload.updates)) { reject(new Error(payload?.message || 'Respuesta inválida del servicio de disponibilidad.')); return; }
        const next = new Map();
        for (const update of payload.updates) {
          if (!/^[a-f0-9]{64}$/.test(update.key) || !['SI', 'NO', 'POR VERIFICAR'].includes(update.state)) {
            reject(new Error('El servicio devolvió una disponibilidad inválida.')); return;
          }
          next.set(update.key, update);
          // Una implementación anterior puede no enviar cantidades; nunca inferirlas del total.
          const quantity = update.availableHomes;
          update.availableHomes = update.state === 'NO' ? 0 : update.state === 'SI' && Number.isSafeInteger(quantity) && quantity > 0 ? quantity : null;
        }
        const nextPhotos = new Map();
        if (payload.photos !== undefined && !Array.isArray(payload.photos)) { reject(new Error('La lista de fotografías es inválida.')); return; }
        for (const photo of (payload.photos || [])) {
          if (!/^[a-f0-9]{64}$/.test(photo.key) || !/^[a-zA-Z0-9-]{16,80}$/.test(photo.id) || ![1,2,3].includes(photo.slot)) {
            reject(new Error('El servicio devolvió una fotografía inválida.')); return;
          }
          if (!nextPhotos.has(photo.key)) nextPhotos.set(photo.key, []);
          if (nextPhotos.get(photo.key).some(p => p.slot === photo.slot)) { reject(new Error('Posición de fotografía duplicada.')); return; }
          nextPhotos.get(photo.key).push(photo);
        }
        updates = next; photos = nextPhotos; resolve();
      };
      script.onerror = () => { cleanup(); reject(new Error('No se pudo consultar Apps Script. Comprueba su implementación y permisos.')); };
      timer = setTimeout(() => { cleanup(); reject(new Error('La consulta de disponibilidad tardó demasiado. Pulsa «Actualizar datos» para reintentar.')); }, 30000);
      script.src = endpoint + '?action=updates&callback=' + callback + '&t=' + Date.now();
      document.head.appendChild(script);
    });
  }
  function open(registration = '') {
    if (!configured) return false;
    const key = keys.get(normalize(registration));
    window.open(panelUrl + (key ? '?proyecto=' + encodeURIComponent(key) : ''), '_blank', 'noopener,noreferrer');
    return true;
  }
  function photoData(id) {
    if (!configured || !/^[a-zA-Z0-9-]{16,80}$/.test(id)) return Promise.reject(new Error('Fotografía no disponible.'));
    return new Promise((resolve, reject) => {
      const callback = 'geovisorUpdates_' + crypto.randomUUID().replace(/-/g, '');
      const script = document.createElement('script');
      let timer;
      function cleanup() { clearTimeout(timer); script.remove(); delete window[callback]; }
      window[callback] = payload => {
        cleanup();
        if (!payload?.ok || payload.id !== id || typeof payload.dataUrl !== 'string' || payload.dataUrl.length > 670000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(payload.dataUrl)) { reject(new Error('Fotografía no disponible.')); return; }
        resolve(payload.dataUrl);
      };
      script.onerror = () => { cleanup(); reject(new Error('No se pudo cargar la fotografía.')); };
      timer = setTimeout(() => { cleanup(); reject(new Error('La fotografía tardó demasiado en cargar.')); }, 30000);
      script.src = endpoint + '?action=photo&id=' + encodeURIComponent(id) + '&callback=' + callback + '&t=' + Date.now();
      document.head.appendChild(script);
    });
  }
  return {
    configured, prepare, refresh, open, photoData,
    get: registration => updates.get(keys.get(normalize(registration))),
    getPhotos: registration => (photos.get(keys.get(normalize(registration))) || []).slice().sort((a,b) => a.slot - b.slot),
    setupMessage: 'Para habilitar las actualizaciones, falta colocar la URL de Apps Script en config.js.'
  };
})();
