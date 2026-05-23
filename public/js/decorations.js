window.LiveChatDecorations = (() => {
  const $ = (id) => document.getElementById(id);

  function decorationTemplate(index) {
    return `<div class="decor-item" data-index="${index}">
      <button class="remove-decor" type="button" aria-label="Hapus dekorasi">×</button>
      <label>URL Gambar Bubble ${index}<input data-field="image" type="url" placeholder="https://.../stiker.png"></label>
      <label>Upload Gambar Bubble ${index} dari Device<input data-field="upload" type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"></label>
      <div class="grid two">
        <label>Tampilkan Gambar Bubble<select data-field="show"><option value="1">Ya</option><option value="0">Tidak</option></select></label>
        <label>Posisi Gambar Bubble<select data-field="position"><option value="inside-bottom-left">Kiri Bawah di Dalam Pesan</option><option value="inside-bottom-right">Kanan Bawah di Dalam Pesan</option><option value="left">Kiri Pesan</option><option value="right">Kanan Pesan</option><option value="top-right">Pojok Kanan Atas</option><option value="bottom-right">Pojok Kanan Bawah</option><option value="bottom-left">Pojok Kiri Bawah</option><option value="top-left">Pojok Kiri Atas</option></select></label>
        <label>Ukuran Gambar Bubble <input data-field="size" type="range" min="20" max="160" value="46"></label>
        <label>Opacity Gambar Bubble <input data-field="opacity" type="range" min="0" max="100" value="100"></label>
      </div>
    </div>`;
  }

  function createManager({ onChange, onUpload }) {
    const list = $('bubbleDecorList');
    let count = 0;

    function add(decor = {}) {
      count += 1;
      list.insertAdjacentHTML('beforeend', decorationTemplate(count));
      const item = list.lastElementChild;
      item.querySelector('[data-field="image"]').value = decor.image || '';
      item.querySelector('[data-field="show"]').value = decor.show || '1';
      item.querySelector('[data-field="position"]').value = decor.position || 'inside-bottom-left';
      item.querySelector('[data-field="size"]').value = decor.size || '46';
      item.querySelector('[data-field="opacity"]').value = decor.opacity || '100';
      bindItem(item);
      return item;
    }

    function bindItem(item) {
      item.querySelectorAll('input,select').forEach((el) => {
        el.addEventListener('input', onChange);
        if (el.type === 'file') {
          el.addEventListener('change', () => onUpload(el, item.querySelector('[data-field="image"]')));
        }
      });
      item.querySelector('.remove-decor').addEventListener('click', () => {
        if (list.children.length <= 1) return reset();
        item.remove();
        onChange();
      });
    }

    function reset() {
      list.innerHTML = '';
      count = 0;
      add({ show: '0' });
      onChange();
    }

    function apply(decorations = []) {
      list.innerHTML = '';
      count = 0;
      const items = decorations.length ? decorations : [{ show: '0' }];
      items.forEach(add);
      onChange();
    }

    function values() {
      return [...list.querySelectorAll('.decor-item')].map((item) => {
        const q = (name) => item.querySelector(`[data-field="${name}"]`)?.value || '';
        return { image: q('image'), show: q('show'), position: q('position'), size: q('size'), opacity: q('opacity') };
      }).filter((decor) => decor.image);
    }

    return { add, apply, reset, values };
  }

  return { createManager, decorationTemplate };
})();
