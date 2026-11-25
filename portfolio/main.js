(() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const app = $('app'), stage = $('stage'), wheel = $('wheel'), dots = $('dots');
  const info = $('info'), zoom = $('zoom'), detail = $('detail');

  const clone = (o) => JSON.parse(JSON.stringify(o));
  let C = clone(DEFAULT_CONTENT);           // 지금 내용
  let target = 0, pos = 0, bgFlip = false, infoToken = 0;
  let zoomed = false, editing = false;
  // 편집은 내 컴퓨터에서 열 때만 (파일로 열기 · localhost). Vercel 등에 올린 사이트에선 편집 버튼·도구가 아예 없음
  const EDITABLE = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
  if (!EDITABLE) document.body.classList.add('view-only');   // CSS로 편집 버튼·도구 숨김
  let thumbs = [];
  // (편집 버튼 위치: 상세 페이지 스크롤 표시 폭 14px 기준 — CSS --sbw)
  const N = () => C.projects.length;

  /* ═════════ 저장 (브라우저 IndexedDB) ═════════ */
  const db = new Promise((ok) => {
    try {
      const r = indexedDB.open('portfolio', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => ok(r.result);
      r.onerror = () => ok(null);
    } catch { ok(null); }
  });
  const idb = async (mode, fn) => {
    const d = await db;
    if (!d) return null;
    return new Promise((ok) => {
      const req = fn(d.transaction('kv', mode).objectStore('kv'));
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ok(null);
    });
  };
  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      await idb('readwrite', (s) => s.put(clone(C), 'content'));
      toast('저장됨');
    }, 500);
  }

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 1400);
  }

  /* ═════════ 데이터 경로 ═════════ */
  const resolve = (k) => (k.startsWith('p.') ? `projects.${target}.${k.slice(2)}` : k);
  const get = (k) => resolve(k).split('.').reduce((o, p) => (o == null ? o : o[p]), C);
  function set(k, v) {
    const parts = resolve(k).split('.');
    const last = parts.pop();
    parts.reduce((o, p) => o[p], C)[last] = v;
  }

  /* ═════════ 글꼴·굵기 (글자칸마다 저장) ═════════ */
  const IMPACT = "Impact, 'Anton', Pretendard, sans-serif";
  function styleSlot(k) {
    const parts = resolve(k).split('.');
    const last = parts.pop();
    const parent = parts.reduce((o, p) => (o == null ? o : o[p]), C);
    return [parent, last];
  }
  const getStyle = (k) => { const [o, f] = styleSlot(k); return o?._st?.[f] || {}; };
  function setStyle(k, patch) {
    const [o, f] = styleSlot(k);
    if (!o) return;
    o._st ??= {};
    o._st[f] = { ...o._st[f], ...patch };
  }
  function applyStyle(el) {
    const st = getStyle(el.dataset.k);
    el.style.fontFamily = st.font === 'impact' ? IMPACT : '';
    el.style.fontWeight = st.weight || '';
    el.style.color = st.color || '';
  }

  /* ═════════ 이미지 (일반 / 크롭) ═════════ */
  const sizes = {};
  const loadSize = (src) => new Promise((ok) => {
    if (sizes[src]) return ok();
    const im = new Image();
    im.onload = () => { sizes[src] = [im.naturalWidth, im.naturalHeight]; ok(); };
    im.onerror = ok;
    im.src = src;
  });

  function setImg(el, img, tone = '#2b2b2b') {
    el.querySelector(':scope > .img-inner')?.remove();
    el.style.background = '';
    if (!img) {
      el.style.background = `radial-gradient(120% 90% at 40% 45%, color-mix(in srgb, ${tone} 30%, #f6f6f4), #e4e3df)`;   // 밝은 빈 칸
      el.classList.add('empty');
      return;
    }
    el.classList.remove('empty');
    const inner = document.createElement('div');
    inner.className = 'img-inner';
    if (typeof img === 'string') {
      Object.assign(inner.style, {
        width: '100%', height: '100%', backgroundImage: `url("${img}")`,
        backgroundSize: 'cover', backgroundPosition: 'center',
      });
    } else {
      const [x, y, w, h] = img.crop;
      const [W, H] = sizes[img.src] || [w, h];
      Object.assign(inner.style, {
        width: `max(100cqw, calc(100cqh * ${w / h}))`,
        aspectRatio: `${w} / ${h}`,
        backgroundImage: `url("${img.src}")`,
        backgroundSize: `${(W / w) * 100}% ${(H / h) * 100}%`,
        backgroundPosition: `${W === w ? 0 : (x / (W - w)) * 100}% ${H === h ? 0 : (y / (H - h)) * 100}%`,
      });
      el.style.containerType = 'size';
    }
    el.prepend(inner);
  }

  // 사진 고르기 → 줄여서 저장
  // 긴 변 최대 크기 (px) — 고해상도(레티나·4K) 화면에서도 선명하게
  const MAX = { thumb: 1200, bg: 3840, hero: 3840, photo: 1600, image: 3200, logo: 2000 };
  // 사진 저장: 충분히 작으면 원본 그대로(다시 압축 안 함), 크면 고품질로 줄여서 저장
  const readURL = (blob) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  async function encodeImage(f, max) {
    const bmp = await createImageBitmap(f);
    const long = Math.max(bmp.width, bmp.height);
    const keep = ['image/jpeg', 'image/webp', 'image/png', 'image/avif'].includes(f.type);
    if (long <= max && keep && f.size <= 6 * 1024 * 1024) { bmp.close?.(); return readURL(f); }   // 원본 화질 그대로
    const s = Math.min(1, max / long);
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    let src = bmp;
    try { src = await createImageBitmap(f, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' }); } catch {}
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, w, h);
    const alpha = f.type === 'image/png' || f.type === 'image/webp';   // 투명 배경(로고 등) 유지
    return cv.toDataURL(alpha ? 'image/webp' : 'image/jpeg', .95);
  }

  function pick(key) {
    const kind = key.split('.').pop();
    const picker = $('picker');
    picker.value = '';
    picker.accept = kind === 'image' ? 'image/*,video/mp4,video/webm' : 'image/*';
    picker.onchange = async () => {
      const f = picker.files[0];
      if (!f) return;
      // 상세 페이지: GIF·영상은 원본 그대로 저장 (움직임 유지)
      if (kind === 'image' && (f.type === 'image/gif' || f.type.startsWith('video/'))) {
        toast('넣는 중…');
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        await idb('readwrite', (st) => st.put(f, 'media:' + id));
        set(key, { media: id, name: f.name, kind: f.type.startsWith('video/') ? 'video' : 'gif' });
        save();
        refresh();
        if (zoomed) renderDetail();
        return;
      }
      toast('사진 넣는 중…');
      set(key, await encodeImage(f, MAX[kind] || 3200));
      if (kind === 'logo') set(key.replace(/logo$/, 'logoMode'), 'image');
      save();
      refresh();
      if (zoomed) renderDetail();
    };
    picker.click();
  }

  /* ═════════ GIF·영상 ═════════ */
  const mediaUrls = {};
  async function mediaURL(v) {
    if (mediaUrls[v.media]) return mediaUrls[v.media];
    const blob = await idb('readonly', (st) => st.get('media:' + v.media));
    // 브라우저에 없으면 assets 폴더의 같은 이름 파일 사용
    return (mediaUrls[v.media] = blob ? URL.createObjectURL(blob) : `assets/${v.name}`);
  }
  async function setMedia(el, v) {
    el.querySelector(':scope > .img-inner')?.remove();
    el.style.background = '';
    el.classList.remove('empty');
    el.classList.add('media');
    const m = document.createElement(v.kind === 'video' ? 'video' : 'img');
    m.className = 'img-inner media-el';
    if (v.kind === 'video') Object.assign(m, { autoplay: true, muted: true, loop: true, playsInline: true });
    m.src = await mediaURL(v);
    el.prepend(m);
    if (v.kind === 'video') m.play?.().catch(() => {});
  }

  const showLogo = (p) => p.logoMode === 'image' && !!p.logo;

  /* ═════════ 글자 채우기 ═════════ */
  function fillText(root = document) {
    $$('[data-k]', root).forEach((el) => {
      applyStyle(el);
      if (el === document.activeElement) return;
      let v = get(el.dataset.k) ?? '';
      // Behance: 평소엔 주소 앞부분만, 편집할 땐 전체 주소
      if (el.dataset.k === 'profile.behance' && !editing)
        v = v.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      el.textContent = v;   // 줄바꿈(\n)은 CSS white-space: pre-line 으로 그대로 보임
    });
  }
  function fillInfo() {
    const p = C.projects[target];
    $('count').textContent = `${String(target + 1).padStart(2, '0')} / ${String(N()).padStart(2, '0')}`;
    fillText(info);
    const useImg = showLogo(p);
    const logo = $('logo');
    logo.hidden = !useImg;
    if (useImg) logo.src = p.logo; else logo.removeAttribute('src');
    logo.alt = p.brand || '';
    $('brandText').hidden = useImg;
    $$('[data-act="logoText"], [data-act="logoImg"]').forEach((b) =>
      b.classList.toggle('on', (b.dataset.act === 'logoImg') === useImg));
  }

  /* ═════════ 관람차 ═════════ */
  function buildWheel() {
    wheel.innerHTML = '';
    dots.innerHTML = '';
    thumbs = C.projects.map((p, i) => {
      const t = document.createElement('div');
      t.className = 'thumb';
      const face = Object.assign(document.createElement('div'), { className: 'thumb-face img' });   // 사진 (구멍이 뚫림)
      t.append(face, Object.assign(document.createElement('span'), { className: 'eyelet' }));       // + 바늘 거는 구멍 링
      t.addEventListener('click', () => {
        if (i !== target) return go(i);
        editing ? pick(`projects.${i}.thumb`) : openProject(false);
      });
      wheel.appendChild(t);
      setImg(face, p.thumb, p.tone);

      const d = document.createElement('button');
      d.setAttribute('aria-label', `${i + 1}번 작품`);
      d.addEventListener('click', () => go(i));
      dots.appendChild(d);
      return t;
    });
  }

  function renderWheel() {
    const H = stage.clientHeight;
    const R = H * 0.41;
    const step = (31 * Math.PI) / 180;
    const size = thumbs[0]?.offsetWidth || 98;
    thumbs.forEach((t, i) => {
      const d = i - pos, ad = Math.abs(d), a = d * step;
      const y = R * Math.sin(Math.max(-1.5, Math.min(1.5, a)));
      const x = R * (1 - Math.cos(a)) * 0.3;
      const s = Math.max(0.3, 1 - 0.25 * ad);
      const op = Math.max(0, 1 - 0.28 * ad - 0.04 * ad * ad);
      const blur = Math.min(ad, 1) * 1.6 + Math.max(0, ad - 1) * 1.4;   // 가운데 0 → 바로 위아래 1.6px → 그다음 3px
      const pull = i === target ? tug : 0;                // 열 때 바늘에 당겨지는 만큼
      t.style.transform = `translate(${x - pull}px, ${y - size / 2}px) scale(${s})`;
      t.style.opacity = zoomed && i === target ? 0 : op;
      t.style.filter = blur ? `blur(${blur}px) brightness(${1 + ad * 0.03})` : '';
      t.style.zIndex = 100 - Math.round(ad * 10);
      t.style.pointerEvents = op < 0.15 ? 'none' : '';
    });
  }

  function loop() {
    const diff = target - pos;
    pos += Math.abs(diff) < 0.001 ? diff : diff * 0.075;
    renderWheel();
    requestAnimationFrame(loop);
  }

  /* ═════════ 작품 바꾸기 ═════════ */
  function showBg() {
    const p = C.projects[target];
    const next = bgFlip ? $('bgA') : $('bgB');
    const prev = bgFlip ? $('bgB') : $('bgA');
    bgFlip = !bgFlip;
    setImg(next, p.bg, p.tone);
    next.style.zIndex = 1; prev.style.zIndex = 0;
    next.classList.remove('on'); void next.offsetWidth;
    next.classList.add('on');
    setTimeout(() => prev.classList.remove('on'), 1100);
  }

  function apply(instant) {
    thumbs.forEach((t, i) => t.classList.toggle('active', i === target));
    [...dots.children].forEach((d, i) => d.classList.toggle('on', i === target));
    showBg();
    if (instant) return fillInfo();
    const my = ++infoToken;
    info.classList.add('out');
    setTimeout(() => {
      if (my !== infoToken) return;
      fillInfo();
      info.classList.remove('out');
      info.classList.add('in');
      void info.offsetWidth;
      info.classList.remove('in');
    }, 420);
  }

  function go(i) {
    i = Math.max(0, Math.min(N() - 1, i));
    if (i === target || zoomed) return;
    if (document.activeElement?.isContentEditable) document.activeElement.blur();
    selectText(null);
    target = i;
    apply();
  }

  // 내용이 바뀌었을 때 전부 다시 그리기
  function refresh() {
    target = Math.max(0, Math.min(N() - 1, target));
    buildWheel();
    setImg($('photo'), C.profile.photo);
    fillText();
    apply(true);
    setEditable();
  }

  /* ═════════ 입력 ═════════ */
  const typing = (e) => e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);
  let acc = 0, locked = false;
  window.addEventListener('wheel', (e) => {
    if (zoomed || !stage.contains(e.target)) return;
    e.preventDefault();
    if (locked) return;
    acc += e.deltaY;
    if (Math.abs(acc) > 40) {
      go(target + Math.sign(acc));
      acc = 0; locked = true;
      setTimeout(() => (locked = false), 700);
    }
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (typing(e)) { if (e.key === 'Escape') e.target.blur(); return; }
    if (e.key === 'Escape' && zoomed) return closeProject();
    if (zoomed) return;
    if (e.key === 'ArrowDown') go(target + 1);
    if (e.key === 'ArrowUp') go(target - 1);
    if (e.key === 'Enter' && !editing) openProject(false);
  });

  let ty = null;
  stage.addEventListener('touchstart', (e) => (ty = e.touches[0].clientY), { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (ty == null) return;
    const dy = ty - e.changedTouches[0].clientY;
    if (Math.abs(dy) > 40) go(target + Math.sign(dy));
    ty = null;
  });

  $('fold').addEventListener('click', () => {
    app.classList.toggle('folded');
  });

  // 연락처: 편집 중이 아닐 때만 전화/메일 열기
  $('tel').addEventListener('click', () => {
    if (!editing) location.href = 'tel:' + (C.profile.phone || '').replace(/[^\d+]/g, '');
  });
  $('behance').addEventListener('click', () => {
    if (editing) return;
    const u = (C.profile.behance || '').trim();
    if (u) window.open(/^https?:\/\//.test(u) ? u : 'https://www.' + u.replace(/^www\./, ''), '_blank', 'noopener');
  });
  $('mail').addEventListener('click', () => {
    if (!editing) location.href = 'mailto:' + (C.profile.email || '').trim();
  });

  /* ═════════ 줌인 → 프로젝트 상세 ═════════ */
  const rectStyle = (r, radius) => ({
    left: r.left + 'px', top: r.top + 'px',
    width: r.width + 'px', height: r.height + 'px', borderRadius: radius,
  });

  function buildZoom(p) {
    zoom.innerHTML = '';
    const a = document.createElement('div');
    const b = document.createElement('div');
    [a, b].forEach((l) => {
      l.className = 'img';
      Object.assign(l.style, { position: 'absolute', inset: 0, transition: 'opacity 900ms ease' });
      zoom.appendChild(l);
    });
    setImg(a, p.thumb, p.tone);
    setImg(b, p.bg || p.thumb, p.tone);
    b.style.opacity = 0;
    return b;
  }

  // 사진 위 텍스트 상자: 위치는 사진 크기 대비 % (x, y)
  const boxes = (path, arr = []) => `
    <div class="txt-layer">${arr.map((b, n) => `
      <div class="txtbox" data-box="${path}.${n}" style="left:${b.x}%;top:${b.y}%">
        <span class="edit-only tb-grip" title="끌어서 옮기기">⠿</span>
        <div class="txt" data-k="${path}.${n}.text"></div>
        <button class="edit-only tb-del" data-box-del="${path}.${n}" title="이 텍스트 지우기">✕</button>
      </div>`).join('')}
    </div>
    <button class="edit-only txt-add" data-txt-add="${path}">+ 텍스트</button>`;

  function renderDetail() {
    const i = target, p = C.projects[i], k = `projects.${i}`;
    $('detailBody').innerHTML = `
      <section class="d-hero">
        <div class="d-hero-img img" data-img="${k}.hero"></div>  <!-- 상세 대표 사진 (메인 배경과 따로) -->
        ${boxes(`${k}.heroTexts`, p.heroTexts)}
        <div class="brand">${showLogo(p) ? `<img class="logo" src="${p.logo}" alt="">` : `<span data-k="${k}.brand"></span>`}</div>
        <p class="tagline" data-k="${k}.tagline"></p>
        <p class="headline" data-k="${k}.headline"></p>
        <p class="scroll">SCROLL ↓</p>
      </section>
      <section class="d-body">
        <div class="d-meta">
          <span>Year<b data-k="${k}.year"></b></span>
          <span>Role<b data-k="${k}.role"></b></span>
        </div>
        ${(p.sections || []).map((s, j) => `
          <div class="d-sec${s.cont ? ' cont' : ''}${s.text == null ? ' no-text' : ''}">
            ${s.cont ? '' : `<h4 data-k="${k}.sections.${j}.title"></h4>`}
            <div class="d-img img" data-img="${k}.sections.${j}.image"><span class="d-img-label">이미지 자리</span>${boxes(`${k}.sections.${j}.texts`, s.texts)}</div>
            ${s.text == null ? '' : `<p data-k="${k}.sections.${j}.text"></p>`}
            <div class="edit-only sec-tools">
              <button class="sec-cont" data-sec-text="${j}">${s.text == null ? '+ 설명 넣기' : '설명 지우기'}</button>
              <button class="sec-cont" data-sec-cont="${j}">+ 이어서 추가</button>
              <button class="sec-cont sec-del" data-sec-del="${j}">${s.cont ? '이 블록 삭제' : '섹션 삭제'}</button>  <!-- 아래 도구 줄 맨 끝 (사진 위 [+ 텍스트]와 안 겹치게) -->
            </div>
          </div>
        `).join('')}
        <button class="edit-only sec-add" id="secAdd">+ 섹션 추가</button>
      </section>`;
    fillText(detail);
    requestAnimationFrame(drawReel);
    $$('[data-img]', detail).forEach((el) => {
      let v = get(el.dataset.img);
      if (!v && el.classList.contains('d-hero-img')) v = p.bg || p.thumb;   // 상세 사진이 없으면 메인 배경으로
      if (v && v.media) setMedia(el, v);
      else { el.classList.remove('media'); setImg(el, v, '#d9d8d4'); }
    });
    setEditable();
  }

  detail.addEventListener('click', (e) => {
    if (!editing) return;
    const p = C.projects[target];
    const addTo = e.target.dataset.txtAdd, delBox = e.target.dataset.boxDel;
    if (addTo) {                                     // 사진 위에 텍스트 상자 추가
      if (!Array.isArray(get(addTo))) set(addTo, []);
      const arr = get(addTo);
      arr.push({ x: 8, y: 10 + (arr.length % 6) * 9, text: '텍스트' });
      save();
      renderDetail();
      const el = $$('[data-k]', detail).find((x) => x.dataset.k === `${addTo}.${arr.length - 1}.text`);
      if (el) { el.focus(); document.getSelection().selectAllChildren(el); }
      return;
    }
    if (delBox) {
      const parts = delBox.split('.'), n = +parts.pop();
      get(parts.join('.')).splice(n, 1);
      save();
      renderDetail();
      return;
    }
    if (e.target.id === 'secAdd') {
      p.sections.push({ title: '제목', text: '내용을 적어주세요.', image: null });
    } else if (e.target.dataset.secText != null) {
      // 설명 칸 지우기/되살리기 → 없으면 사진끼리 바로 붙음
      const s = p.sections[+e.target.dataset.secText];
      s.text = s.text == null ? '내용을 적어주세요.' : null;
    } else if (e.target.dataset.secCont != null) {
      // 같은 섹션의 연속 블록: 제목·구분선 없이 바로 아래에 붙음
      p.sections.splice(+e.target.dataset.secCont + 1, 0, { cont: true, text: '내용을 적어주세요.', image: null });
    } else if (e.target.dataset.secDel != null) {
      if (!confirm('이 섹션을 지울까요?')) return;
      p.sections.splice(+e.target.dataset.secDel, 1);
    } else return;
    save();
    renderDetail();
  });

  // 텍스트 상자 끌어서 옮기기 (편집 중, ⠿ 손잡이)
  detail.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest('.tb-grip');
    if (!editing || !grip) return;
    e.preventDefault();
    const box = grip.closest('.txtbox'), layer = box.parentElement, R = layer.getBoundingClientRect();
    const b0 = box.getBoundingClientRect(), ox = e.clientX - b0.left, oy = e.clientY - b0.top;
    grip.setPointerCapture(e.pointerId);
    let x = 0, y = 0;
    const move = (ev) => {
      x = Math.max(3, Math.min(92, (ev.clientX - ox - R.left) / R.width * 100));
      y = Math.max(0, Math.min(96, (ev.clientY - oy - R.top) / R.height * 100));
      box.style.left = x + '%'; box.style.top = y + '%';
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      if (x || y) { set(`${box.dataset.box}.x`, +x.toFixed(2)); set(`${box.dataset.box}.y`, +y.toFixed(2)); save(); }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
  });

  /* ═════════ 상세 페이지 스크롤 = 낚싯줄 ═════════
     흰 길 위로, 스크롤한 만큼 위에서부터 파란 줄이 내려오고 줄 끝에 바늘이 매달려 있음 */
  const reel = $('dReel'), reelLine = $('dReelLine'), reelHook = reel.querySelector('.d-reel-hook');
  const HOOK_W = 12, HOOK_H = HOOK_W * 156 / 114, EYE_X = (200 - 150) / 114 * HOOK_W, EYE_Y = (250 - 236) / 156 * HOOK_H;
  const MIN_LINE = 18;                                 // 맨 위에서도 줄이 조금은 내려와 있음
  function drawReel() {
    const max = detail.scrollHeight - detail.clientHeight;
    reel.classList.toggle('off', max <= 2);
    if (max <= 2) return;
    const p = Math.min(1, Math.max(0, detail.scrollTop / max));
    const H = reel.clientHeight, len = MIN_LINE + p * (H - MIN_LINE - HOOK_H - 6);
    reelLine.style.height = len + 'px';
    reelHook.style.transform = `translate(${reel.clientWidth / 2 - EYE_X}px, ${len - EYE_Y}px)`;
  }
  detail.addEventListener('scroll', drawReel, { passive: true });
  addEventListener('resize', drawReel);
  new ResizeObserver(drawReel).observe($('detailBody'));
  // 스크롤 길을 누르거나 끌면 그 위치로
  reel.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    reel.setPointerCapture(e.pointerId);
    reel.classList.add('drag');
    const to = (ev) => {
      const r = reel.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (ev.clientY - r.top - MIN_LINE) / (r.height - MIN_LINE - HOOK_H - 6)));
      detail.scrollTop = p * (detail.scrollHeight - detail.clientHeight);
    };
    to(e);
    const up = () => {
      reel.classList.toggle('drag', false);
      reel.removeEventListener('pointermove', to);
      reel.removeEventListener('pointerup', up);
    };
    reel.addEventListener('pointermove', to);
    reel.addEventListener('pointerup', up);
  });

  let fromBg = false;   // 배경을 눌러서 열었는지
  // 프로필을 접었을 때의 배경 자리와 똑같은 사각형 → 배경으로 열 때 이미지가 움직이지 않음
  function fullStageRect() {
    const ml = parseFloat(getComputedStyle(stage).marginLeft) || 0;   // -18px
    return { left: ml, top: 0, width: innerWidth - ml, height: innerHeight };
  }
  // 썸네일 열기: 구멍에 건 바늘이 왼쪽으로 확 잡아당김 → 그 기세로 화면 가득 펼쳐짐
  let tug = 0, pulling = false;
  function openProject(bg = false) {
    if (zoomed || pulling || closing) return;
    if (bg || matchMedia('(prefers-reduced-motion: reduce)').matches) return reallyOpen(bg);
    pulling = true;
    const t0 = performance.now();
    (function step(now) {
      const u = Math.min(1, (now - t0) / 240);
      tug = 22 * (u < .35 ? -.25 * Math.sin(u / .35 * Math.PI) : 1 - Math.pow(1 - (u - .35) / .65, 3));   // 살짝 버팀 → 확 당겨짐
      if (u < 1) return requestAnimationFrame(step);
      pulling = false;
      reallyOpen(false);
    })(t0);
  }
  /* 썸네일 → 상세: 바늘에 걸린 썸네일 박스가 왼쪽으로 화면을 가로지르고,
     그 뒤를 따라 상세 페이지가 오른쪽부터 덮여 옴. 닫을 땐 반대로 */
  const easeIO = (u) => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
  function carryBox(r, fromX, toX, ms, edgeOf, done) {
    buildZoom(C.projects[target]);
    const hole = Object.assign(document.createElement('span'), { className: 'eyelet' });
    zoom.appendChild(hole);
    zoom.classList.add('carry');
    zoom.style.transition = 'none';
    Object.assign(zoom.style, rectStyle({ left: fromX, top: r.top, width: r.width, height: r.height }, '10px'),
      { visibility: 'visible', opacity: 1 });
    detail.style.transition = 'none';
    detail.classList.add('open');
    const t0 = performance.now();
    (function step(now) {
      const u = Math.min(1, (now - t0) / ms), k = easeIO(u);
      zoom.style.left = (fromX + (toX - fromX) * k) + 'px';
      detail.style.clipPath = `inset(0 0 0 ${edgeOf(k).toFixed(1)}px)`;   // 상세 페이지 왼쪽 끝 = 박스 바로 뒤
      if (u < 1) return requestAnimationFrame(step);
      zoom.style.visibility = 'hidden';
      zoom.classList.remove('carry');
      zoom.style.transition = '';
      done();
    })(t0);
  }
  function slideOpen() {
    const r = thumbs[target].getBoundingClientRect();
    tug = 0;
    renderDetail();
    detail.scrollTop = 0;
    carryBox(r, r.left, -r.width - 60, 1100, (k) => innerWidth * (1 - k), () => {
      detail.style.clipPath = '';
      detail.style.transition = '';
    });
  }
  // 상세 → 메인: 왼쪽 구멍에 건 바늘이 오른쪽으로 잡아당김 → 상세 페이지가 통째로 오른쪽으로 걷혀 나감
  let closing = false;
  function pullClose() {
    closing = true;
    zoomed = false;                                  // 걷히는 동안 뒤의 썸네일이 보이도록
    zoom.style.visibility = 'hidden';
    refresh();                                       // 상세에서 고친 내용 반영
    const W = innerWidth, t0 = performance.now(), T = 950;
    detail.style.transition = 'none';
    (function step(now) {
      const u = Math.min(1, (now - t0) / T);
      const f = u < .16 ? -.025 * Math.sin(u / .16 * Math.PI) : easeIO((u - .16) / .84);   // 살짝 버팀 → 쭉
      detail.style.transform = `translateX(${(W * f).toFixed(1)}px)`;
      if (u < 1) return requestAnimationFrame(step);
      detail.classList.remove('open');
      detail.style.transform = '';
      requestAnimationFrame(() => { detail.style.transition = ''; });
      closing = false;
    })(t0);
  }

  function reallyOpen(bg) {
    if (zoomed) return;
    zoomed = true;
    fromBg = bg;
    if (!bg && !matchMedia('(prefers-reduced-motion: reduce)').matches) return slideOpen();
    const p = C.projects[target];
    const r = (bg ? stage : thumbs[target]).getBoundingClientRect();
    tug = 0;                                         // 썸네일은 숨겨지니 제자리로
    const layerB = buildZoom(p);
    if (bg) { layerB.style.transition = 'none'; layerB.style.opacity = 1; }

    zoom.style.transition = 'none';
    Object.assign(zoom.style, rectStyle(r, bg ? '0px' : '10px'), { visibility: 'visible', opacity: 1 });
    // 화면 전체가 고르게 어두워졌다가 다시 밝아짐
    const dim = $('dimmer');
    dim.classList.remove('dip'); void dim.offsetWidth; dim.classList.add('dip');
    // 메인 화면의 가장자리 그늘을 이어받아 천천히 걷어냄 (가장자리만 밝기가 튀지 않게)
    const sh = document.createElement('div');
    sh.className = 'zoom-shade';
    sh.style.opacity = bg ? 1 : 0;
    zoom.appendChild(sh);
    requestAnimationFrame(() => requestAnimationFrame(() => (sh.style.opacity = 0)));
    void zoom.offsetWidth;
    zoom.style.transition = '';
    Object.assign(zoom.style, rectStyle(bg ? fullStageRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight }, '0px'));
    layerB.style.opacity = 1;

    renderDetail();
    detail.scrollTop = 0;
    setTimeout(() => detail.classList.add('open'), 700);
  }

  function closeProject() {
    if (!zoomed) return;
    if (closing) return;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) return pullClose();
    detail.classList.remove('open');
    refresh();   // 상세에서 고친 내용 반영
    const r = (fromBg ? stage : thumbs[target]).getBoundingClientRect();
    buildZoom(C.projects[target]).style.opacity = 1;
    setTimeout(() => {
      if (!fromBg) zoom.children[1].style.opacity = 0;   // 썸네일로 돌아갈 땐 썸네일 이미지로
      Object.assign(zoom.style, rectStyle(r, fromBg ? '0px' : '10px'));
      setTimeout(() => { zoomed = false; zoom.style.visibility = 'hidden'; }, 900);
    }, 300);
  }
  $('close').addEventListener('click', closeProject);

  // 배경(큰 이미지)을 눌러도 상세 페이지로
  stage.addEventListener('click', (e) => {
    if (editing || zoomed || e.target.closest('.wheel, .dots')) return;
    openProject(true);
  });

  /* ═════════ 편집 모드 ═════════ */
  const ceValue = (() => {
    const t = document.createElement('div');
    t.contentEditable = 'plaintext-only';
    return t.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  function setEditable() {
    $$('[data-k]').forEach((el) => {
      if (editing) el.setAttribute('contenteditable', ceValue);
      else el.removeAttribute('contenteditable');
    });
  }

  function setEditing(on) {
    if (!EDITABLE) on = false;
    editing = on;
    document.body.classList.toggle('editing', on);
    if (!on) selectText(null);
    fillText(document.querySelector('.contact'));
    $('editToggle').textContent = on ? '✎ 편집 중' : '✎ 편집';
    setEditable();
  }
  $('editToggle').addEventListener('click', () => setEditing(!editing));

  // 글꼴·굵기: 마지막으로 클릭한 글자칸에 적용
  let selKey = null;
  function selectText(el) {
    $$('[data-k].sel').forEach((x) => x.classList.remove('sel'));
    selKey = el ? resolve(el.dataset.k) : null;
    if (el) el.classList.add('sel');
    $('fontCtl').classList.toggle('off', !el);
    if (!el) return;
    const st = getStyle(selKey);
    $$('[data-act="fontP"], [data-act="fontI"]').forEach((b) =>
      b.classList.toggle('on', (b.dataset.act === 'fontI') === (st.font === 'impact')));
    const w = Math.round((st.weight || +getComputedStyle(el).fontWeight || 400) / 100) * 100;
    $('weight').value = Math.min(900, Math.max(100, w));
    showColor(st.color || toHex(getComputedStyle(el).color));
  }

  // 글자 색: #ffffff · ffffff · #fff 모두 받음
  const toHex = (rgb) => {
    const m = rgb.match(/\d+/g);
    return m ? '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') : '#2b2b2b';
  };
  const parseHex = (v) => {
    v = v.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(v)) v = v.replace(/./g, (c) => c + c);
    return /^[0-9a-f]{6}$/.test(v) ? '#' + v : null;
  };
  function showColor(hex) {
    $('colorPick').value = hex;
    if (document.activeElement !== $('colorHex')) $('colorHex').value = hex;
  }
  function setColor(hex) {
    if (!selKey) return toast('먼저 바꿀 글자를 클릭하세요');
    setStyle(selKey, { color: hex });
    restyleAll();
    save();
  }
  $('colorHex').addEventListener('input', (e) => {
    const hex = parseHex(e.target.value);
    e.target.classList.toggle('bad', !hex && e.target.value.trim() !== '');
    if (hex) { $('colorPick').value = hex; setColor(hex); }
  });
  $('colorHex').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
  $('colorHex').addEventListener('blur', (e) => {   // 잘못 적었으면 지금 색으로 되돌림
    e.target.classList.remove('bad');
    const el = $$('[data-k]').find((x) => resolve(x.dataset.k) === selKey);
    if (el) e.target.value = getStyle(selKey).color || toHex(getComputedStyle(el).color);
  });
  $('colorPick').addEventListener('input', (e) => { $('colorHex').value = e.target.value; setColor(e.target.value); });
  document.addEventListener('focusin', (e) => {
    if (editing && e.target.dataset?.k) selectText(e.target);
  });
  const restyleAll = () => $$('[data-k]').forEach(applyStyle);
  $('weight').addEventListener('input', (e) => {
    if (!selKey) return;
    setStyle(selKey, { weight: +e.target.value });
    restyleAll();
    save();
  });
  // 툴바를 눌러도 글자칸 선택이 풀리지 않게
  $('toolbar').addEventListener('mousedown', (e) => {
    if (!['INPUT', 'SELECT', 'OPTION'].includes(e.target.tagName)) e.preventDefault();
  });

  // 글자 고치기
  // 편집 칸 글자 읽기: 브라우저가 줄바꿈을 <br>·<div>로 넣어도 전부 \n 으로 바꿔서 읽음
  //  (예전엔 textContent로 읽어서 <br> 줄바꿈이 저장에서 빠졌고 → 사진 바꾸기 등으로 다시 그리면 글이 붙었음)
  function readText(el) {
    let out = '';
    (function walk(n) {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) out += c.data;
        else if (c.nodeName === 'BR') out += '\n';
        else if (c.nodeType === 1) {
          if (/^(DIV|P|LI)$/.test(c.nodeName) && out && !out.endsWith('\n')) out += '\n';
          walk(c);
        }
      }
    })(el);
    return out.replace(/\u00a0/g, ' ');
  }

  // Enter = 줄바꿈 문자(\n) 하나. 브라우저마다 <div>·<br>로 넣는 차이를 없애서 편집 화면과 보기 화면이 똑같게
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing || !editing) return;
    const el = e.target;
    if (!el.isContentEditable || !el.dataset?.k) return;
    e.preventDefault();
    const sel = getSelection(), r = sel.rangeCount && sel.getRangeAt(0);
    const tail = r ? document.createRange() : null;
    if (tail) { tail.selectNodeContents(el); tail.setStart(r.endContainer, r.endOffset); }
    const atEnd = tail && tail.toString() === '';
    // 맨 끝에서 Enter: 빈 줄이 보이도록 하나 더 (저장할 땐 끝의 한 개는 지움)
    document.execCommand('insertText', false, atEnd && !readText(el).endsWith('\n') ? '\n\n' : '\n');
  }, true);
  document.addEventListener('input', (e) => {
    const k = e.target.dataset?.k;
    if (!k) return;
    set(k, readText(e.target).replace(/\n$/, ''));
    save();
  });
  // 붙여넣기는 글자만
  document.addEventListener('paste', (e) => {
    if (!e.target.closest?.('[data-k]')) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  // 링크 안 열리게
  document.addEventListener('click', (e) => {
    if (editing && e.target.classList?.contains('logo')) return pick(`projects.${target}.logo`);
    if (e.target.closest('.txtbox, .txt-add')) return;   // 텍스트 상자 누를 땐 사진 바꾸기 안 함
    const imgEl = e.target.closest('[data-img]');
    if (editing && imgEl) return pick(imgEl.dataset.img);
    // 상세 대표 사진은 글자 아래에 깔려 있어서, 글자가 아닌 곳을 누르면 바꾸기
    if (editing && e.target.closest('.d-hero') && !e.target.closest('[data-k], .logo, button')) pick(`projects.${target}.hero`);
  });

  // 툴바
  $('toolbar').addEventListener('click', async (e) => {
    const act = e.target.dataset.act;
    if (!act) return;
    const P = C.projects;
    const p = P[target];
    if (act === 'thumb') return pick(`projects.${target}.thumb`);
    if (act === 'bg') return pick(`projects.${target}.bg`);
    if (act === 'hero') return pick(`projects.${target}.hero`);
    if (act === 'done') return setEditing(false);
    if (act === 'colorReset') {
      if (!selKey) return toast('먼저 바꿀 글자를 클릭하세요');
      setStyle(selKey, { color: null });
      restyleAll(); save();
      const el = $$('[data-k]').find((x) => resolve(x.dataset.k) === selKey);
      if (el) showColor(toHex(getComputedStyle(el).color));
      return;
    }
    if (act === 'fontP' || act === 'fontI') {
      if (!selKey) return toast('먼저 바꿀 글자를 클릭하세요');
      setStyle(selKey, { font: act === 'fontI' ? 'impact' : null });
      restyleAll();
      const el = $$('[data-k]').find((x) => resolve(x.dataset.k) === selKey);
      if (el) selectText(el);
      return save();
    }
    if (act === 'logoText') p.logoMode = 'text';
    if (act === 'logoImg') {
      if (!p.logo) return pick(`projects.${target}.logo`);   // 사진이 없으면 고르기
      p.logoMode = 'image';
    }
    if (act === 'logoPick') return pick(`projects.${target}.logo`);
    if (act === 'syncAll') {
      if (!confirm(`이 작품의 상세 페이지 구성(섹션 ${p.sections.length}개)을 모든 작품에 똑같이 맞출까요?\n이미 쓴 글과 사진은 그대로 남아요.`)) return;
      syncStructure(target);
      toast('모든 작품 구성을 맞췄어요');
    }
    if (act === 'up' && target > 0) { [P[target - 1], P[target]] = [P[target], P[target - 1]]; target--; pos = target; }
    if (act === 'down' && target < N() - 1) { [P[target + 1], P[target]] = [P[target], P[target + 1]]; target++; pos = target; }
    if (act === 'add') {
      P.splice(target + 1, 0, {
        brand: '새 작품', tagline: '한 줄 소개',
        headline: '대표 문장을\n적어주세요.', thumb: null, bg: null, tone: '#2b2f36',
        year: String(new Date().getFullYear()), role: 'Product Design',
        logoMode: 'text', logo: null,
        sections: p.sections.map((s) => ({ title: s.title, text: '내용을 적어주세요.', image: null })),
      });
      target++;
    }
    if (act === 'del') {
      if (N() <= 1) return toast('작품은 최소 1개 필요해요');
      if (!confirm(`'${p.brand}' 작품을 지울까요?`)) return;
      P.splice(target, 1);
    }
    if (act === 'export') return exportFile();
    if (act === 'reset') {
      if (!confirm('고친 내용을 모두 지우고 처음 상태로 돌아갈까요?')) return;
      C = clone(DEFAULT_CONTENT);
      await idb('readwrite', (s) => s.delete('content'));
      target = Math.min(C.start ?? 0, N() - 1); pos = target;
      refresh();
      return toast('처음 상태로 돌아갔어요');
    }
    save();
    refresh();
  });

  // 툴바 드래그로 옮기기 (위치 기억)
  (() => {
    const bar = $('toolbar'), handle = $('tbHandle');
    const clamp = (x, y) => [
      Math.max(8, Math.min(innerWidth - bar.offsetWidth - 8, x)),
      Math.max(8, Math.min(innerHeight - bar.offsetHeight - 8, y)),
    ];
    const place = (x, y) => {
      [x, y] = clamp(x, y);
      bar.classList.add('moved');
      bar.style.left = x + 'px';
      bar.style.top = y + 'px';
      return [x, y];
    };
    try {
      const p = JSON.parse(localStorage.getItem('toolbarPos'));
      if (p) requestAnimationFrame(() => place(p[0], p[1]));
    } catch {}

    let dx, dy;
    handle.addEventListener('pointerdown', (e) => {
      const r = bar.getBoundingClientRect();
      dx = e.clientX - r.left; dy = e.clientY - r.top;
      place(r.left, r.top);
      bar.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!bar.classList.contains('dragging')) return;
      place(e.clientX - dx, e.clientY - dy);
    });
    const end = () => {
      if (!bar.classList.contains('dragging')) return;
      bar.classList.remove('dragging');
      try { localStorage.setItem('toolbarPos', JSON.stringify([bar.offsetLeft, bar.offsetTop])); } catch {}
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    // 툴바 핸들 더블클릭 → 원래 자리(아래 가운데)
    handle.addEventListener('dblclick', () => {
      bar.classList.remove('moved');
      bar.style.left = bar.style.top = '';
      try { localStorage.removeItem('toolbarPos'); } catch {}
    });
    addEventListener('resize', () => {
      if (bar.classList.contains('moved')) place(bar.offsetLeft, bar.offsetTop);
    });
  })();

  // 기준 작품의 섹션 구성(제목 순서)을 다른 작품에 맞추기 — 글·사진은 보존
  function syncStructure(ref) {
    const titles = C.projects[ref].sections.map((s) => s.title);
    C.projects.forEach((p, i) => {
      p.logoMode ??= p.logo ? 'image' : 'text';
      if (i === ref) return;
      const old = p.sections || [];
      const used = new Set();
      const next = titles.map((t) => {
        const j = old.findIndex((s, k) => !used.has(k) && s.title.trim().toLowerCase() === t.trim().toLowerCase());
        if (j >= 0) { used.add(j); return old[j]; }
        return { title: t, text: '내용을 적어주세요.', image: null };
      });
      old.forEach((s, k) => { if (!used.has(k)) next.push(s); });   // 기준에 없는 섹션은 뒤에 보존
      p.sections = next;
    });
  }

  function exportFile() {
    const txt = `/* 포트폴리오 내용 — ${new Date().toLocaleString('ko-KR')} 저장\n   이 파일을 portfolio 폴더의 content.js와 바꿔 넣으세요. */\n\nconst DEFAULT_CONTENT = ${JSON.stringify(C, null, 2)};\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    a.download = 'content.js';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('content.js 내려받음');
    const files = [];
    JSON.stringify(C, (k, v) => { if (v && v.media) files.push(v.name); return v; });
    if (files.length) setTimeout(() => alert(
      'GIF·영상은 content.js에 들어가지 않아요.\n아래 파일들을 portfolio/assets 폴더에 같은 이름으로 넣어주세요:\n\n• ' + files.join('\n• ')), 300);
  }

  /* ═════════ 시작 ═════════ */
  (async () => {
    // 올린 사이트에선 브라우저에 남은 편집본이 아니라 항상 content.js 내용을 보여 줌
    const saved = EDITABLE ? await idb('readonly', (s) => s.get('content')) : null;
    if (saved && saved.projects?.length) C = saved;
    C.profile.behance ??= DEFAULT_CONTENT.profile.behance;
    target = pos = Math.min(C.start ?? 0, N() - 1);
    // 한 번만: 모든 작품을 3번 작품 구성에 맞추기
    if ((C.v || 1) < 2) {
      syncStructure(Math.min(2, N() - 1));
      C.v = 2;
      save();
    }
    const srcs = new Set();
    const walk = (o) => {
      if (!o || typeof o !== 'object') return;
      if (o.crop && o.src) srcs.add(o.src);
      Object.values(o).forEach(walk);
    };
    walk(C);
    await Promise.all([...srcs].map(loadSize));
    refresh();
    loop();
  })();
})();
