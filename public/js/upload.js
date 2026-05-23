window.LiveChatUpload = (() => {
  const $ = (id) => document.getElementById(id);

  async function uploadImage(fileInput, targetInput, onDone = () => {}) {
    const input = typeof fileInput === 'string' ? $(fileInput) : fileInput;
    const target = typeof targetInput === 'string' ? $(targetInput) : targetInput;
    const file = input?.files?.[0];
    if (!file || !target) return;
    if (!file.type.startsWith('image/')) { alert('File harus berupa gambar.'); input.value = ''; return; }
    if (file.size > 5 * 1024 * 1024) { alert('Ukuran gambar maksimal 5MB.'); input.value = ''; return; }

    const label = input.closest('label');
    const originalText = label?.childNodes?.[0]?.textContent || '';
    if (label?.childNodes?.[0]) label.childNodes[0].textContent = 'Uploading... ';

    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload gagal.');
      target.value = data.url;
      onDone();
    } catch (error) {
      alert(error.message || 'Upload gagal.');
    } finally {
      if (label?.childNodes?.[0]) label.childNodes[0].textContent = originalText;
      input.value = '';
    }
  }

  return { uploadImage };
})();
