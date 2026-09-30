/* Solo se solicitan imágenes que figuran como aprobadas en el manifiesto público. */
window.ProjectPhotos = {
  async render(section, registration, name) {
    const photos = Availability.getPhotos(registration);
    if (!photos.length) return;
    section.hidden = false;
    const status = document.createElement('p'); status.className = 'project-photo-status'; status.setAttribute('role','status');
    status.textContent = 'Cargando fotografías del proyecto…'; section.appendChild(status);
    const results = await Promise.all(photos.map(async photo => {
      try { return {photo, src: await Availability.photoData(photo.id)}; } catch { return null; }
    }));
    if (!section.isConnected) return;
    const loaded = results.filter(Boolean);
    if (!loaded.length) { status.textContent = 'Las fotografías no están disponibles. Pulsa «Actualizar datos» para consultar su estado.'; return; }
    status.textContent = loaded.length + (loaded.length === 1 ? ' fotografía del proyecto' : ' fotografías del proyecto');
    const cover = document.createElement('button'); cover.type = 'button'; cover.className = 'project-photo-cover'; cover.setAttribute('aria-label', 'Ampliar fotografía de ' + name);
    const coverImage = document.createElement('img'); coverImage.alt = 'Fotografía de ' + name; coverImage.decoding = 'async'; cover.appendChild(coverImage); section.appendChild(cover);
    const thumbs = document.createElement('div'); thumbs.className = 'project-photo-thumbs'; section.appendChild(thumbs);
    const dialog = document.createElement('dialog'); dialog.className = 'photo-lightbox'; dialog.setAttribute('aria-label','Fotografías de ' + name);
    dialog.innerHTML = '<img alt=""><div class="photo-lightbox-controls"><button type="button" data-direction="-1" aria-label="Fotografía anterior">←</button><span aria-live="polite"></span><button type="button" data-direction="1" aria-label="Fotografía siguiente">→</button><button type="button" data-close>Cerrar</button></div>';
    section.appendChild(dialog);
    let index = 0;
    const buttons = loaded.map((item, i) => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('aria-label','Ver fotografía ' + item.photo.slot);
      const img = document.createElement('img'); img.src = item.src; img.alt = ''; button.appendChild(img);
      button.addEventListener('click', () => select(i)); thumbs.appendChild(button); return button;
    });
    function select(i) {
      index = (i + loaded.length) % loaded.length;
      coverImage.src = loaded[index].src;
      dialog.querySelector('img').src = loaded[index].src;
      dialog.querySelector('img').alt = 'Fotografía ' + loaded[index].photo.slot + ' de ' + name;
      dialog.querySelector('span').textContent = (index + 1) + ' de ' + loaded.length;
      buttons.forEach((button,j) => button.setAttribute('aria-pressed',String(j === index)));
    }
    cover.addEventListener('click', () => dialog.showModal());
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-direction]').forEach(button => {
      button.hidden = loaded.length === 1;
      button.addEventListener('click', () => select(index + Number(button.dataset.direction)));
    });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    thumbs.hidden = loaded.length === 1;
    select(0);
  }
};
