(() => {
  'use strict';
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const views = ['home', 'scanner', 'explorer', 'assistant', 'vision'];
  const state = { stream: null, devices: [], frozen: false, image: null, chatImage: '', history: [], chatHistory: [], toastTimer: 0, testIndex: 0, score: 0, answered: false, testQuestions: [] };
  const toast = (message) => { const el = $('#toast'); el.textContent = message; el.classList.add('show'); clearTimeout(state.toastTimer); state.toastTimer = setTimeout(() => el.classList.remove('show'), 2400); };

  // Navigation keeps one workspace visible at a time and releases camera resources on exit.
  function showView(name) {
    if (!views.includes(name)) return;
    if (name !== 'scanner') stopCamera();
    $$('.view').forEach(el => el.classList.toggle('active', el.id === `view-${name}`));
    $$('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.view === name));
    window.scrollTo({ top: 0, behavior: document.body.classList.contains('reduced-motion') ? 'instant' : 'smooth' });
    if (name === 'scanner') refreshDevices();
  }
  $$('[data-view]').forEach(el => el.addEventListener('click', () => showView(el.dataset.view)));

  // Local recent samples are descriptive as well as visual so color is never the only signal.
  function loadHistory() {
    try { state.history = JSON.parse(localStorage.getItem('colorcare-history') || '[]').slice(0, 8); } catch { state.history = []; }
    renderHistory();
  }
  function renderHistory() {
    const list = $('#historyList');
    if (!state.history.length) { list.innerHTML = '<p class="muted">Your samples will appear here.</p>'; return; }
    list.replaceChildren(...state.history.map((item) => {
      const button = document.createElement('button'); button.className = 'history-chip'; button.type = 'button'; button.title = `View ${item.name} ${item.hex}`;
      const swatch = document.createElement('i'); swatch.style.backgroundColor = item.hex;
      const label = document.createElement('span'); label.textContent = `${item.name} · ${item.hex}`;
      button.append(swatch, label); button.addEventListener('click', () => fillResult('camera', item.rgb)); return button;
    }));
  }
  function saveHistory(color) {
    state.history = [color, ...state.history.filter(item => item.hex !== color.hex)].slice(0, 8);
    try { localStorage.setItem('colorcare-history', JSON.stringify(state.history)); } catch { /* storage may be unavailable */ }
    renderHistory();
  }

  function colorFromRgb(rgb) {
    const [r, g, b] = rgb.map(v => Math.max(0, Math.min(255, Math.round(v))));
    const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255, d = max - min;
    let h = 0; const l = (max + min) / 2; let s = 0;
    if (d) { s = d / (1 - Math.abs(2 * l - 1)); if (max === r / 255) h = ((g / 255 - b / 255) / d) % 6; else if (max === g / 255) h = (b / 255 - r / 255) / d + 2; else h = (r / 255 - g / 255) / d + 4; h = (h * 60 + 360) % 360; }
    // Simple HSV sectors provide understandable base names, with lightness/saturation modifiers.
    let base;
    if (max < .12) base = 'Black'; else if (l > .94 && s < .12) base = 'White'; else if (s < .13) base = l < .42 ? 'Charcoal Gray' : l > .78 ? 'Light Gray' : 'Gray';
    else if (h < 12 || h >= 345) base = l < .27 ? 'Maroon' : 'Red'; else if (h < 34) base = l < .48 ? 'Brown' : 'Orange'; else if (h < 48) base = 'Orange'; else if (h < 68) base = l < .45 ? 'Olive' : 'Yellow'; else if (h < 155) base = h < 100 ? 'Lime' : 'Green'; else if (h < 185) base = 'Teal'; else if (h < 205) base = 'Cyan'; else if (h < 250) base = l < .3 ? 'Navy' : 'Blue'; else if (h < 280) base = 'Indigo'; else if (h < 315) base = s < .38 ? 'Lavender' : 'Purple'; else base = l > .68 ? 'Pink' : 'Magenta';
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { rgb: [r, g, b], hex, name: base, hsl: [Math.round(h), Math.round(s * 100), Math.round(l * 100)] };
  }
  function mapCoverPoint(clientX, clientY, rect, sourceWidth, sourceHeight) {
    if (!rect.width || !rect.height || !sourceWidth || !sourceHeight) return null;
    const xCss = clientX - rect.left, yCss = clientY - rect.top;
    const scale = Math.max(rect.width / sourceWidth, rect.height / sourceHeight);
    const shownW = sourceWidth * scale, shownH = sourceHeight * scale;
    return {
      x: Math.round((xCss + (shownW - rect.width) / 2) / scale),
      y: Math.round((yCss + (shownH - rect.height) / 2) / scale),
      xCss, yCss,
    };
  }
  function mapImagePixel(clientX, clientY, rect, sourceWidth, sourceHeight) {
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom
        || !rect.width || !rect.height || !sourceWidth || !sourceHeight) return null;
    return {
      x: Math.max(0, Math.min(sourceWidth - 1, Math.floor((clientX - rect.left) * sourceWidth / rect.width))),
      y: Math.max(0, Math.min(sourceHeight - 1, Math.floor((clientY - rect.top) * sourceHeight / rect.height))),
    };
  }
  function averageRgba(pixelBytes) {
    if (!pixelBytes || pixelBytes.length === 0 || pixelBytes.length % 4 !== 0) throw new Error('Expected RGBA pixel data.');
    let r = 0, g = 0, b = 0, count = 0;
    for (let i = 0; i < pixelBytes.length; i += 4) { r += pixelBytes[i]; g += pixelBytes[i + 1]; b += pixelBytes[i + 2]; count++; }
    return [r / count, g / count, b / count];
  }
  function fillResult(prefix, rgb, remember = true) {
    const color = colorFromRgb(rgb);
    $(`#${prefix}Swatch`).style.backgroundColor = color.hex; $(`#${prefix}Swatch`).classList.add('has-color');
    $(`#${prefix}Swatch`).replaceChildren(); $(`#${prefix}Name`).textContent = color.name;
    $(`#${prefix}Hex`).textContent = color.hex; $(`#${prefix}Rgb`).textContent = `${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]}`;
    $(`#${prefix}Hsl`).textContent = `${color.hsl[0]}°, ${color.hsl[1]}%, ${color.hsl[2]}%`;
    $$(`[data-copy="${prefix}Hex"]`).forEach(btn => btn.disabled = false);
    const speak = $(`#speak${prefix[0].toUpperCase()}${prefix.slice(1)}`); if (speak) speak.disabled = false;
    if (prefix === 'camera') { $('#liveTag').textContent = 'SAMPLED'; $('#sampleHint').textContent = `${color.name} · ${color.hex}`; }
    if (remember) saveHistory(color);
    return color;
  }

  // Clipboard and speech APIs are optional and always give the user a clear result.
  $$('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    const value = $(`#${button.dataset.copy}`).textContent;
    try { await navigator.clipboard.writeText(value); toast(`${value} copied`); }
    catch { const field = document.createElement('textarea'); field.value = value; document.body.append(field); field.select(); document.execCommand('copy'); field.remove(); toast(`${value} copied`); }
  }));
  function speak(text) {
    if (!$('#voiceEnabled').checked) { toast('Voice output is turned off in Accessibility settings.'); return; }
    if (!('speechSynthesis' in window)) { toast('Voice output is not available in this browser.'); return; }
    speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }
  $('#speakCamera').addEventListener('click', () => speak(`The detected color is ${$('#cameraName').textContent}. Hexadecimal code ${$('#cameraHex').textContent.replace('#', '').split('').join(' ')}. RGB ${$('#cameraRgb').textContent}.`));
  $('#speakImage').addEventListener('click', () => speak(`The selected color is ${$('#imageName').textContent}. Hexadecimal code ${$('#imageHex').textContent.replace('#', '').split('').join(' ')}. RGB ${$('#imageRgb').textContent}.`));
  $('#stopSpeech').addEventListener('click', () => { if ('speechSynthesis' in window) speechSynthesis.cancel(); });
  $('#clearHistory').addEventListener('click', () => { state.history = []; localStorage.removeItem('colorcare-history'); renderHistory(); });

  // Webcam sampling maps the visible object-fit:cover region back to the source frame.
  const video = $('#cameraVideo'), cameraCanvas = $('#cameraCanvas'), cameraCtx = cameraCanvas.getContext('2d', { willReadFrequently: true });
  async function refreshDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      state.devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'videoinput');
      const select = $('#cameraSelect'), selected = select.value; select.replaceChildren();
      state.devices.forEach((device, index) => { const option = document.createElement('option'); option.value = device.deviceId; option.textContent = device.label || `Camera ${index + 1}`; select.append(option); });
      if (!state.devices.length) { const option = document.createElement('option'); option.textContent = 'No camera found'; option.value = ''; select.append(option); }
      if (state.devices.some(d => d.deviceId === selected)) select.value = selected;
    } catch { /* Camera request will show a friendly message if enumeration is blocked. */ }
  }
  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { toast('Camera access needs a supported browser on localhost or HTTPS.'); return; }
    stopCamera();
    $('#cameraStatus').textContent = 'Requesting access…';
    try {
      const deviceId = $('#cameraSelect').value;
      state.stream = await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }, audio: false });
      video.srcObject = state.stream; await video.play(); state.frozen = false;
      $('#videoPlaceholder').hidden = true; $('#cameraDot').classList.add('on'); $('#cameraStatus').textContent = 'Camera live'; $('#liveTag').textContent = 'LIVE'; $('#sampleHint').textContent = 'Click a point to sample';
      $('#startCamera').disabled = true; $('#stopCamera').disabled = false; $('#captureFrame').disabled = false; $('#scanFrame').disabled = false;
      await refreshDevices();
    } catch (error) {
      stopCamera(); const denied = error.name === 'NotAllowedError' || error.name === 'SecurityError';
      toast(denied ? 'Camera permission was denied. Allow access in your browser settings.' : error.name === 'NotFoundError' ? 'No camera device was found.' : 'Camera is unavailable or already in use.');
      $('#cameraStatus').textContent = denied ? 'Permission needed' : 'Camera unavailable';
    }
  }
  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach(track => track.stop()); state.stream = null; video.srcObject = null;
    $('#videoPlaceholder').hidden = false; $('#cameraDot').classList.remove('on');
    if ($('#cameraStatus')) $('#cameraStatus').textContent = 'Camera off';
    if ($('#startCamera')) { $('#startCamera').disabled = false; $('#stopCamera').disabled = true; $('#captureFrame').disabled = true; $('#scanFrame').disabled = true; }
    state.frozen = false;
  }
  $('#startCamera').addEventListener('click', startCamera); $('#stopCamera').addEventListener('click', stopCamera);
  $('#cameraSelect').addEventListener('change', () => { if (state.stream) startCamera(); });
  function videoPoint(event) {
    return mapCoverPoint(event.clientX, event.clientY, video.getBoundingClientRect(), video.videoWidth, video.videoHeight);
  }
  function sampleVideo(x, y, hintPoint = null) {
    if (!state.stream || !video.videoWidth) { toast('Start the camera before sampling.'); return; }
    cameraCanvas.width = video.videoWidth; cameraCanvas.height = video.videoHeight; cameraCtx.drawImage(video, 0, 0);
    x = Math.max(0, Math.min(cameraCanvas.width - 1, x)); y = Math.max(0, Math.min(cameraCanvas.height - 1, y));
    const left = Math.max(0, x - 4), top = Math.max(0, y - 4), width = Math.min(9, cameraCanvas.width - left), height = Math.min(9, cameraCanvas.height - top);
    const pixels = cameraCtx.getImageData(left, top, width, height).data;
    fillResult('camera', averageRgba(pixels));
    if (hintPoint) { const target = $('.target-crosshair'); target.style.left = `${hintPoint.xCss}px`; target.style.top = `${hintPoint.yCss}px`; }
  }
  $('#videoShell').addEventListener('click', event => { if (!state.stream) return; const point = videoPoint(event); if (!point) return; sampleVideo(point.x, point.y, point); });
  $('#scanFrame').addEventListener('click', () => sampleVideo(Math.floor(video.videoWidth / 2), Math.floor(video.videoHeight / 2)));
  $('#captureFrame').addEventListener('click', () => {
    if (!state.stream) return;
    if (!state.frozen) { video.pause(); state.frozen = true; $('#captureFrame').innerHTML = '▶ Resume'; $('#cameraStatus').textContent = 'Frame captured'; $('#liveTag').textContent = 'CAPTURED'; }
    else { video.play(); state.frozen = false; $('#captureFrame').innerHTML = '▣ Capture'; $('#cameraStatus').textContent = 'Camera live'; $('#liveTag').textContent = 'LIVE'; }
  });

  // Image uploads stay in memory; clicking uses the displayed image's natural pixel coordinates.
  const imageFile = $('#imageFile'), uploadedImage = $('#uploadedImage'), imageCanvas = $('#imageCanvas'), imageCtx = imageCanvas.getContext('2d', { willReadFrequently: true });
  function loadImageFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast('Choose a JPG, PNG, or WEBP image.'); return; }
    if (file.size > 8 * 1024 * 1024) { toast('That image is over the 8 MB upload limit.'); return; }
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > 24_000_000) { URL.revokeObjectURL(url); toast('Choose an image under 24 megapixels.'); return; }
      if (state.image?.url) URL.revokeObjectURL(state.image.url);
      state.image = { file, url, image: img }; uploadedImage.src = url; uploadedImage.hidden = false; $('#imageEmpty').hidden = true;
      imageCanvas.width = img.naturalWidth; imageCanvas.height = img.naturalHeight; imageCtx.drawImage(img, 0, 0);
      $('#fileName').textContent = `${file.name} · ${img.naturalWidth} × ${img.naturalHeight}`; $('#extractPalette').disabled = false; $('#describeImage').disabled = false;
      $('#paletteSection').hidden = true; $('#imageMarker').hidden = true; toast('Image ready. Select a point to identify its color.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened.'); }; img.src = url;
  }
  imageFile.addEventListener('change', () => loadImageFile(imageFile.files[0]));
  $('#dropZone').addEventListener('dragover', event => { event.preventDefault(); $('#dropZone').classList.add('dragover'); });
  $('#dropZone').addEventListener('dragleave', event => { if (!$('#dropZone').contains(event.relatedTarget)) $('#dropZone').classList.remove('dragover'); });
  $('#dropZone').addEventListener('drop', event => { event.preventDefault(); $('#dropZone').classList.remove('dragover'); loadImageFile(event.dataTransfer.files[0]); });
  $('#imageCanvasWrap').addEventListener('click', event => {
    if (!state.image) return;
    const rect = uploadedImage.getBoundingClientRect();
    const point = mapImagePixel(event.clientX, event.clientY, rect, imageCanvas.width, imageCanvas.height);
    if (!point) return;
    const px = imageCtx.getImageData(point.x, point.y, 1, 1).data; fillResult('image', [px[0], px[1], px[2]]);
    const marker = $('#imageMarker'); marker.hidden = false; marker.style.left = `${event.clientX - $('#imageCanvasWrap').getBoundingClientRect().left}px`; marker.style.top = `${event.clientY - $('#imageCanvasWrap').getBoundingClientRect().top}px`;
  });
  $('#extractPalette').addEventListener('click', async () => {
    if (!state.image) return;
    const button = $('#extractPalette'); button.disabled = true; button.textContent = 'Extracting…';
    try {
      const form = new FormData(); form.append('image', state.image.file);
      const response = await fetch('/api/analyze-image', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Palette extraction failed.');
      $('#paletteMeta').textContent = `${data.width} × ${data.height} · ${data.palette.length} colors`;
      const grid = $('#paletteGrid'); grid.replaceChildren(...data.palette.map(item => {
        const button = document.createElement('button'); button.className = 'palette-item'; button.type = 'button'; button.title = `Inspect ${item.name}, ${item.hex}`;
        const block = document.createElement('div'); block.className = 'palette-color'; block.style.backgroundColor = item.hex;
        const info = document.createElement('div'); info.className = 'palette-info'; const name = document.createElement('strong'); name.textContent = item.name; const hex = document.createElement('code'); hex.textContent = `${item.hex} · ${item.percent}%`; info.append(name, hex); button.append(block, info);
        button.addEventListener('click', () => fillResult('image', item.rgb)); return button;
      })); $('#paletteSection').hidden = false;
    } catch (error) { toast(error.message || 'Palette extraction failed.'); }
    finally { button.disabled = false; button.textContent = '✳ Extract palette'; }
  });
  $('#describeImage').addEventListener('click', async () => {
    if (!state.image) return;
    const button = $('#describeImage'); button.disabled = true; button.textContent = 'Asking AI…';
    try {
      const form = new FormData(); form.append('image', state.image.file); form.append('describe', 'true');
      const response = await fetch('/api/analyze-image', { method: 'POST', body: form }); const data = await response.json();
      if (data.ai_error) throw new Error(data.ai_error); if (!response.ok) throw new Error(data.error || 'Image description failed.');
      showView('assistant'); addMessage('assistant', data.description); speak(data.description);
    } catch (error) { toast(error.message || 'Image description failed.'); }
    finally { button.disabled = false; button.textContent = '◌ Describe with AI'; }
  });

  // Chat content is inserted as text nodes, never trusted HTML.
  function addMessage(role, content) {
    const row = document.createElement('div'); row.className = `message ${role === 'user' ? 'user-message' : 'assistant-message'}`;
    if (role !== 'user') { const avatar = document.createElement('div'); avatar.className = 'message-avatar'; avatar.setAttribute('aria-hidden', 'true'); for (let tileIndex = 0; tileIndex < 4; tileIndex++) avatar.append(document.createElement('i')); row.append(avatar); }
    const body = document.createElement('div'); if (role !== 'user') { const label = document.createElement('span'); label.className = 'message-label'; label.textContent = 'COLORCARE'; body.append(label); }
    const p = document.createElement('p'); p.textContent = content; body.append(p); row.append(body);
    if (state.chatImage && role === 'user') { const img = document.createElement('img'); img.src = state.chatImage; img.alt = 'Attached image'; img.style.cssText = 'max-width:140px;border-radius:6px;display:block;margin-top:8px'; row.append(img); }
    $('#chatMessages').append(row); $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; return p;
  }
  $('#chatImage').addEventListener('change', () => {
    const file = $('#chatImage').files[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 8 * 1024 * 1024) { toast('Choose a JPG, PNG, or WEBP image under 8 MB.'); $('#chatImage').value = ''; return; }
    const reader = new FileReader(); reader.onload = () => { state.chatImage = reader.result; $('#attachPreview').hidden = false; $('#attachPreview').textContent = `Image attached: ${file.name} · `; const clear = document.createElement('button'); clear.type = 'button'; clear.className = 'quiet-button'; clear.textContent = 'Remove'; clear.onclick = () => { state.chatImage = ''; $('#attachPreview').hidden = true; $('#chatImage').value = ''; }; $('#attachPreview').append(clear); }; reader.readAsDataURL(file);
  });
  $('#chatForm').addEventListener('submit', async event => {
    event.preventDefault(); const input = $('#chatInput'), message = input.value.trim(); if (!message && !state.chatImage) { toast('Write a question or attach an image.'); return; }
    const actualMessage = message || 'Describe the objects and colors in this image.'; addMessage('user', actualMessage); input.value = '';
    const image = state.chatImage; state.chatImage = ''; $('#attachPreview').hidden = true; $('#chatImage').value = '';
    const send = $('.send-button'); send.disabled = true; const p = addMessage('assistant', 'Connecting…'); const thinking = p.closest('.message'); let reply = '';
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: actualMessage, image, history: state.chatHistory.slice(-8), stream: true }) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || 'Assistant unavailable.'); }
      if (!response.body) throw new Error('Streaming is not available in this browser.');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read(); buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const frames = buffer.split('\n\n'); buffer = frames.pop();
        for (const frame of frames) {
          const line = frame.split('\n').find(item => item.startsWith('data: ')); if (!line) continue;
          const payload = line.slice(6); if (payload === '[DONE]') continue;
          const event = JSON.parse(payload); if (event.error) throw new Error(event.error);
          if (event.text) { reply += event.text; p.textContent = reply; $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight; }
        }
        if (done) break;
      }
      if (!reply) reply = 'I couldn’t form a response just now. Please try again.';
      p.textContent = reply; state.chatHistory.push({ role: 'user', content: actualMessage }, { role: 'assistant', content: reply });
    } catch (error) {
      const message = error.message || 'ColorCare could not reach the AI service.';
      if (reply) p.textContent = `${reply}\n\n${message}`;
      else { thinking.remove(); addMessage('assistant', message); }
    }
    finally { send.disabled = false; input.focus(); }
  });
  $$('.suggestion').forEach(button => button.addEventListener('click', () => { $('#chatInput').value = button.dataset.prompt; $('#chatInput').focus(); }));
  $('#clearChat').addEventListener('click', () => { state.chatHistory = []; $('#chatMessages').replaceChildren(); addMessage('assistant', 'Chat cleared. What would you like to explore?'); });

  // Generated pseudo-plate questions are for reflection only, not clinical screening.
  const plateColors = [
    ['#d9b84f', '#488a60'], ['#76af91', '#ce754b'], ['#cf7657', '#5b9f78'],
    ['#598dc2', '#b2a05b'], ['#d5b64e', '#a86672'], ['#80b49a', '#bb6d54'],
    ['#d1a35a', '#568b78'], ['#b6a0d6', '#c07b54'], ['#d9bb69', '#5485a2'],
    ['#82b5a0', '#b86367'], ['#c9a05e', '#5d9874'], ['#d27e62', '#6687ad']
  ];
  const numberSymbols = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
  const shapeChoices = [
    { symbol: '○', answer: 'Circle' }, { symbol: '△', answer: 'Triangle' },
    { symbol: '□', answer: 'Square' }, { symbol: '◇', answer: 'Diamond' },
    { symbol: '☆', answer: 'Star' }, { symbol: '♥', answer: 'Heart' },
    { symbol: '+', answer: 'Cross' }, { symbol: '⬟', answer: 'Pentagon' },
    { symbol: '⬢', answer: 'Hexagon' }, { symbol: '☾', answer: 'Crescent' }
  ];
  const letterSymbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
  const questionPool = [
    ...numberSymbols.map((answer, index) => ({
      id: `number-${answer}`, type: 'number', symbol: answer, answer,
      options: [answer, numberSymbols[(index + 2) % numberSymbols.length], numberSymbols[(index + 5) % numberSymbols.length], 'I cannot tell'],
      colors: plateColors[index % plateColors.length]
    })),
    ...shapeChoices.map((shape, index) => ({
      id: `shape-${shape.answer.toLowerCase()}`, type: 'shape', ...shape,
      options: [shape.answer, shapeChoices[(index + 2) % shapeChoices.length].answer, shapeChoices[(index + 5) % shapeChoices.length].answer, 'I cannot tell'],
      colors: plateColors[(index + 3) % plateColors.length]
    })),
    ...letterSymbols.map((answer, index) => ({
      id: `letter-${answer}`, type: 'letter', symbol: answer, answer,
      options: [answer, letterSymbols[(index + 2) % letterSymbols.length], letterSymbols[(index + 5) % letterSymbols.length], 'I cannot tell'],
      colors: plateColors[(index + 6) % plateColors.length]
    }))
  ].map(question => ({
    ...question,
    label: question.type === 'number' ? 'What number do you see?' : question.type === 'letter' ? 'Which letter is visible?' : 'Which shape is visible?'
  }));
  let previousQuestionSet = '';
  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }
  function selectQuestions() {
    const selected = shuffle(questionPool).slice(0, 6);
    if (selected.map(question => question.id).sort().join('|') === previousQuestionSet) {
      const replacement = shuffle(questionPool.filter(question => !selected.includes(question)))[0];
      selected[5] = replacement;
    }
    previousQuestionSet = selected.map(question => question.id).sort().join('|');
    state.testQuestions = selected;
  }
  function renderQuestion() {
    state.answered = false; const q = state.testQuestions[state.testIndex]; $('#questionProgress').textContent = `QUESTION ${state.testIndex + 1} OF ${state.testQuestions.length}`; $('#progressFill').style.width = `${(state.testIndex / state.testQuestions.length) * 100}%`;
    const content = $('#testContent'); content.replaceChildren(); const layout = document.createElement('div'); layout.className = 'question-layout';
    const plate = document.createElement('div'); plate.className = 'question-plate'; plate.style.backgroundColor = q.colors[0]; plate.style.backgroundImage = `radial-gradient(circle,${q.colors[1]} 0 2px,transparent 3px),radial-gradient(circle,${q.colors[0]} 0 2px,transparent 3px),radial-gradient(circle,${q.colors[1]}88 0 1px,transparent 2px)`; plate.style.backgroundSize = '17px 19px,23px 21px,13px 16px'; plate.style.backgroundPosition = '0 0,8px 7px,5px 11px';
    const symbol = document.createElement('span'); symbol.className = 'plate-symbol'; symbol.textContent = q.symbol; symbol.style.color = q.colors[1]; plate.append(symbol);
    const dots = document.createElement('span'); dots.className = 'plate-dots'; plate.append(dots);
    const copy = document.createElement('div'); copy.className = 'question-copy'; const h = document.createElement('h2'); h.textContent = q.label; const desc = document.createElement('p'); desc.textContent = 'Choose the option that best matches what you can see.'; const options = document.createElement('div'); options.className = 'answer-options';
    shuffle(q.options).forEach(option => { const button = document.createElement('button'); button.type = 'button'; button.className = 'answer-option'; button.textContent = option; button.addEventListener('click', () => answerQuestion(option, button)); options.append(button); });
    const feedback = document.createElement('div'); feedback.className = 'question-feedback'; feedback.id = 'questionFeedback'; const next = document.createElement('button'); next.className = 'button primary next-question'; next.textContent = state.testIndex === state.testQuestions.length - 1 ? 'See summary' : 'Next question'; next.hidden = true; next.addEventListener('click', nextQuestion);
    copy.append(h, desc, options, feedback, next); layout.append(plate, copy); content.append(layout);
  }
  function answerQuestion(option, button) {
    if (state.answered) return; state.answered = true; const correct = option === state.testQuestions[state.testIndex].answer; if (correct) state.score++;
    $$('.answer-option').forEach(item => item.disabled = true); button.classList.add('selected'); $('#questionFeedback').textContent = correct ? 'You identified the pattern.' : 'Thanks. Every response helps you reflect on your experience.'; $('.next-question').hidden = false;
  }
  function nextQuestion() { state.testIndex++; if (state.testIndex < state.testQuestions.length) { renderQuestion(); return; } renderSummary(); }
  function renderSummary() {
    $('#progressFill').style.width = '100%'; $('#questionProgress').textContent = 'ACTIVITY COMPLETE'; const content = $('#testContent'); content.replaceChildren(); const div = document.createElement('div'); div.className = 'result-summary';
    const score = document.createElement('div'); score.className = 'result-score'; score.textContent = `${state.score} / ${state.testQuestions.length}`; const h = document.createElement('h2'); h.textContent = 'Thanks for taking part.'; const p = document.createElement('p'); p.textContent = 'This activity is for reflection only. A score cannot determine whether you have a color vision deficiency; viewing conditions, screen settings, and individual variation can all affect what you see. If you have concerns, please arrange a professional eye examination.';
    const disclaimer = document.createElement('div'); disclaimer.className = 'medical-disclaimer'; disclaimer.textContent = 'Educational screening only. This is not a medical diagnosis. A professional eye examination is required for proper assessment.'; const restart = document.createElement('button'); restart.className = 'button primary'; restart.textContent = 'Restart activity'; restart.addEventListener('click', startTest); div.append(score, h, p, disclaimer, restart); content.append(div);
  }
  function startTest() { selectQuestions(); state.testIndex = 0; state.score = 0; $('#screening').hidden = true; $('#testArea').hidden = false; renderQuestion(); $('#testArea').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  $('#startTest').addEventListener('click', startTest); $('#exitTest').addEventListener('click', () => { $('#testArea').hidden = true; $('#screening').hidden = false; });

  // Preferences are persistent and each control has a visible behavior.
  const settings = { largeText: 'large-text', highContrast: 'high-contrast', reducedMotion: 'reduced-motion' };
  Object.entries(settings).forEach(([id, className]) => { const input = $(`#${id}`); input.checked = localStorage.getItem(`cc-${id}`) === 'true'; document.body.classList.toggle(className, input.checked); input.addEventListener('change', () => { document.body.classList.toggle(className, input.checked); localStorage.setItem(`cc-${id}`, input.checked); }); });
  $('#voiceEnabled').checked = localStorage.getItem('cc-voiceEnabled') !== 'false'; $('#voiceEnabled').addEventListener('change', () => localStorage.setItem('cc-voiceEnabled', $('#voiceEnabled').checked));
  function setAccessibilityPanelOpen(isOpen) {
    $('#accessPanel').hidden = !isOpen;
    $('#accessOpen').setAttribute('aria-expanded', String(isOpen));
    $('#accessOpen').setAttribute('aria-label', isOpen ? 'Close accessibility settings' : 'Open accessibility settings');
    $('#accessOpen').title = isOpen ? 'Close accessibility settings' : 'Accessibility settings';
    if (isOpen) $('#largeText').focus();
  }
  $('#accessOpen').addEventListener('click', () => setAccessibilityPanelOpen($('#accessPanel').hidden));
  $('#accessClose').addEventListener('click', () => setAccessibilityPanelOpen(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setAccessibilityPanelOpen(false); });

  loadHistory();
})();
