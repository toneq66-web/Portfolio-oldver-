/* ─────────────────────────────────────────────
   메인 페이지 커서 = 낚싯바늘
   - 평소: 똑바로 선 바늘, 바늘 끝(미늘)이 클릭 지점
   - 접힌 프로필 손잡이에 올리면: 시계 방향 90° 돌며 손잡이 구멍에 바늘이 걸림
   - 썸네일에 올리면: 반시계 방향 90° 돌며 썸네일 구멍에 바늘이 걸림
   - 열린 프로필의 닫기 구멍에 올리면: 썸네일처럼 반시계 90° 돌며 구멍에 걸림
   마우스가 없는 기기·편집 모드·인트로 중에는 원래 커서(CSS)를 씀
   ───────────────────────────────────────────── */
(() => {
  if (!matchMedia('(pointer: fine)').matches) return;

  const W = 26, H = 30;                 // 커서 크기 (px)
  const S = W / 152;                    // SVG 단위 → px  (viewBox 126 226 152 176)
  const px = (x, y) => [(x - 126) * S, (y - 226) * S];
  const TIP = px(240, 314);             // 미늘 끝 = 평소 클릭 지점
  const BEND = px(200, 380);            // 바늘 굽은 바닥 = 구멍에 걸리는 곳

  const shape = (c, w, r, bw) =>
    `<path d="M240 340 A40 40 0 1 1 200 300 L200 278" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="200" cy="250" r="${r}" fill="${c}"/>` +
    `<polygon points="240,314 226,345 254,345" fill="${c}" stroke="${c}" stroke-width="${bw}" stroke-linejoin="round"/>`;
  const el = document.createElement('div');
  el.className = 'hook-cursor';
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="126 226 152 176">${shape('#fff', 30, 16, 14)}${shape('#2563eb', 16, 9, .01)}</svg>`;
  document.body.appendChild(el);

  let mx = -100, my = -100, inside = false;
  let target = null;                    // { hole, rot } 바늘이 걸릴 구멍
  let cx = -100, cy = -100, cr = 0;     // 지금 그려진 위치·각도
  let blendUntil = 0;                   // 걸고 풀 때만 부드럽게 (평소엔 지연 없이 바로 따라감)
  let held = false;                     // 썸네일 박스를 끌고 가는 동안엔 마우스와 상관없이 구멍에 걸려 있음
  addEventListener('hook:hold', (e) => { held = true; target = e.detail; blendUntil = performance.now() + 260; });
  addEventListener('hook:release', () => { held = false; target = null; blendUntil = performance.now() + 360; });

  const introOn = () => !!document.getElementById('intro');
  const active = () => !introOn() && !document.body.classList.contains('editing');

  function findHole(node) {
    if (!(node instanceof Element)) return null;
    const tab = node.closest('.app.folded .fold');
    if (tab) return { hole: tab.querySelector('.eyelet'), rot: 90 };        // 시계 방향
    const out = node.closest('#close');
    if (out) return { hole: out, rot: 90 };                                    // 상세 페이지 왼쪽 구멍: 오른쪽으로 당기니 시계 방향
    const close = node.closest('.app:not(.folded) .fold');
    if (close) return { hole: close.querySelector('.eyelet'), rot: -90 };     // 열린 프로필 닫기 구멍: 썸네일처럼 반시계
    const th = node.closest('.thumb');
    if (th && +getComputedStyle(th).opacity > .3) return { hole: th.querySelector('.eyelet'), rot: -90 };   // 반시계 방향
    return null;
  }

  addEventListener('mousemove', (e) => {
    mx = e.clientX; my = e.clientY; inside = true;
    if (held) return;
    const t = findHole(e.target);
    if ((t && t.hole) !== (target && target.hole)) blendUntil = performance.now() + 260;
    target = t && t.hole ? t : null;
  }, { passive: true });
  document.addEventListener('mouseleave', () => { inside = false; });
  // 프로필 열고 닫을 땐 구멍이 박스와 함께 움직이므로 바늘을 바로 풀어 마우스 자리에 남김
  addEventListener('mousedown', (e) => {
    if (e.target instanceof Element && e.target.closest('.fold')) { target = null; blendUntil = performance.now() + 200; }
  }, true);
  addEventListener('blur', () => { inside = false; });

  (function frame(now) {
    const on = active() && inside;
    document.body.classList.toggle('hook-cursor-on', active());
    el.style.opacity = on ? 1 : 0;

    if (on) {
      let tx = mx, ty = my, rot = 0, P = TIP;
      if (target) {
        const r = target.hole.getBoundingClientRect();
        const host = target.hole.closest('.thumb');
        const far = Math.hypot(r.left + r.width / 2 - mx, r.top + r.height / 2 - my) > 140;   // 구멍이 마우스에서 멀어지면(움직이는 박스 등) 따라가지 않음
        if (!held && (far || !r.width || (host && host.style.opacity !== '' && +host.style.opacity < .3))) { target = null; blendUntil = now + 260; }
        else { tx = r.left + r.width / 2; ty = r.top + r.height / 2; rot = target.rot; P = BEND; }
      }
      // 점 P가 (tx, ty)에 오도록: 왼쪽 위 = 목표점 − 회전(P)
      const a = rot * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      const lx = tx - (P[0] * cos - P[1] * sin), ly = ty - (P[0] * sin + P[1] * cos);
      const k = now < blendUntil || target ? .3 : 1;
      cx += (lx - cx) * k; cy += (ly - cy) * k; cr += (rot - cr) * k;
      el.style.transform = `translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px) rotate(${cr.toFixed(2)}deg)`;
    }
    requestAnimationFrame(frame);
  })(performance.now());
})();
