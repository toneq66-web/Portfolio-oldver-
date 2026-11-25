/* ─────────────────────────────────────────────
   인트로: ? → (뒤집기·회전) → 낚싯바늘 → ! 물고기를 낚아 올림
   클릭 / 스크롤 / Enter / Skip → 메인으로
   ───────────────────────────────────────────── */
(() => {
  const intro = document.getElementById('intro');
  if (!intro) return;
  const $ = (id) => document.getElementById(id);
  const BLUE = '#2563eb';
  const anims = [];
  const t0 = performance.now();
  const END = 6900;          // 애니메이션이 다 끝나는 시점 (ms)
  let leaving = false;

  const play = (el, frames, delay, duration, easing = 'cubic-bezier(.45,0,.25,1)') => {
    const a = el.animate(frames, { delay, duration, easing, fill: 'both' });
    anims.push(a);
    return a;
  };

  /* ① 물음표 등장 */
  play($('qwrap'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], 100, 800);

  /* ② 물음표 뒤집기 → 낚싯바늘 */

  play($('qm'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-180deg)' }], 1400, 1400, 'cubic-bezier(.65,0,.35,1)');
  play($('qcurve'), [{ stroke: '#333', strokeWidth: 14 }, { stroke: BLUE, strokeWidth: 16 }], 1700, 900);
  play($('qdot'), [{ fill: '#333' }, { fill: BLUE }], 1700, 900);
  play($('barb'), [{ opacity: 0, transform: 'scale(.2)' }, { opacity: 1, transform: 'scale(1)' }], 2600, 400, 'cubic-bezier(.2,.9,.3,1.3)');

  /* ③ 낚싯줄 + 수면 */
  play($('fline'), [{ strokeDashoffset: 1500 }, { strokeDashoffset: 0 }], 2700, 800);
  play($('water'), [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }], 2800, 1000);

  play($('school'), [{ opacity: 0 }, { opacity: 1 }], 3000, 1400, 'ease');

  /* ④⑤ 물속으로 → 물고기를 걸어 올림 */
  const rigAnim = play($('rig'), [
    { transform: 'translateY(0px)', offset: 0, easing: 'cubic-bezier(.45,0,.55,1)' },
    { transform: 'translateY(130px)', offset: 0.27 },
    { transform: 'translateY(130px)', offset: 0.63, easing: 'cubic-bezier(.25,.8,.3,1.12)' },  // 물속에서 기다리는 동안 물고기가 와서 묾
    { transform: 'translateY(-40px)', offset: 1 },
  ], 3300, 2700, 'linear');
  $('fish').style.opacity = 0;   // 처음엔 빈 바늘 — 물속 물고기가 와서 물면 나타남

  // 물 밖으로 나올 때 물방울
  [...$('splash').children].forEach((d, i) => {
    const dx = [-26, -12, 10, 24, 36][i], up = [22, 34, 30, 20, 12][i];
    play(d, [
      { transform: 'translate(0,0)', opacity: 0 },
      { transform: `translate(${dx * .5}px, ${-up}px)`, opacity: 1, offset: .4 },
      { transform: `translate(${dx}px, 6px)`, opacity: 0 },
    ], 5080 + i * 25, 750, 'ease-out');
  });

  /* ⑥ 문구 */
  play($('introTitle'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 5900, 900);
  play($('introSub'), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], 6050, 900);
  play($('introHint'), [{ opacity: 0 }, { opacity: 1 }], 6700, 800);
  // 문구가 나올 땐 물속 물고기들이 서서히 사라짐 (글자와 겹치지 않게)
  // fill: 'forwards' — 기다리는 동안엔 위의 등장 애니메이션을 덮지 않도록
  const schoolOut = $('school').animate([{ opacity: 1 }, { opacity: 0 }],
    { delay: 5500, duration: 1600, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });

  // 움직임 줄이기 설정이면 바로 마지막 장면
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { anims.forEach((a) => a.finish()); $('fish').style.opacity = 1; }

  /* 마우스를 따라 낚싯줄이 살짝 흔들림 */
  let tx = 0, ax = 0, alive = true;
  intro.addEventListener('mousemove', (e) => { tx = (e.clientX / innerWidth - .5) * 7; });

  /* ⑦ 낚은 뒤: 바늘(+물고기)이 마우스를 따라감 — 스프링으로 천천히, 진자처럼 흔들림
        커서가 수면 아래면 물에 담기고, 수면을 지날 때 물방울·파문 */
  const svg = intro.querySelector('svg');
  const rig = $('rig');
  const WATER = 420, PIVOT_X = 200, PIVOT_Y = 295;   // 바늘 고리 위치 (rig 좌표)
  const REST = { x: 0, y: -40 };
  const FOLLOW_AT = 6100;                             // 물고기를 다 낚아 올린 뒤
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let following = false, ramp = 0;
  let revealing = false, rv = null;                  // 메인으로 넘어가는 연출 중
  let target = { ...REST }, pos = { ...REST }, vel = { x: 0, y: 0 }, ang = 0, angV = 0;
  let wasUnder = false, lastSplash = 0;

  intro.addEventListener('mousemove', (e) => {
    const m = svg.getScreenCTM();
    if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    target = { x: clamp(p.x - PIVOT_X, -320, 320), y: clamp(p.y - PIVOT_Y, -230, 250) };
  });
  intro.addEventListener('mouseleave', () => { target = { ...REST }; });

  function startFollow() {
    following = true;
    rigAnim.cancel();                       // 키프레임 대신 직접 위치를 잡음
    rig.style.transform = `translate(${REST.x}px, ${REST.y}px)`;
    $('fish').style.opacity = hasFish ? 1 : 0;
  }

  function stepFollow() {
    ramp = Math.min(1, ramp + 0.012);       // 처음엔 아주 천천히 따라오기 시작
    const hookY = PIVOT_Y + pos.y + 45;     // 물고기 몸통 가운데쯤
    const under = hookY > WATER;
    const k = 0.045 * ramp, damp = under ? 0.78 : 0.86;   // 물속은 더 묵직하게
    vel.x = (vel.x + (target.x - pos.x) * k) * damp;
    vel.y = (vel.y + (target.y - pos.y) * k) * damp;
    pos.x += vel.x; pos.y += vel.y;

    // 움직이는 방향 반대로 물고기가 처지며 흔들림 (진자)
    const angT = clamp(vel.x * 1.6, -18, 18) * (under ? 0.5 : 1);
    angV = (angV + (angT - ang) * 0.07) * (under ? 0.8 : 0.9);
    ang += angV;
    rig.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${ang}deg)`;

    // 수면을 지나는 순간
    if (under !== wasUnder) {
      const now = performance.now();
      if (Math.abs(vel.y) > 0.8 && now - lastSplash > 250) {
        splashAt(PIVOT_X + pos.x - Math.sin(ang * Math.PI / 180) * 45, Math.abs(vel.y));
        lastSplash = now;
      }
      wasUnder = under;
    }
  }

  const NS = 'http://www.w3.org/2000/svg';
  function splashAt(x, speed) {
    const g = $('splash');
    const power = clamp(speed / 4, 0.5, 1.4);
    // 파문
    const r = document.createElementNS(NS, 'ellipse');
    Object.entries({ cx: x, cy: WATER, rx: 1, ry: 1, fill: 'none', stroke: BLUE, 'stroke-width': 1.2 })
      .forEach(([k, v]) => r.setAttribute(k, v));
    g.appendChild(r);
    r.animate([{ rx: 2, ry: 0.5, opacity: 0.55 }, { rx: 46 * power, ry: 4, opacity: 0 }],
      { duration: 1100, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => r.remove();
    // 물방울
    for (let i = 0; i < 5; i++) {
      const d = document.createElementNS(NS, 'circle');
      Object.entries({ cx: x, cy: WATER, r: 1.8 + Math.random() * 1.4, fill: BLUE })
        .forEach(([k, v]) => d.setAttribute(k, v));
      g.appendChild(d);
      const dx = (i - 2) * 11 * power + (Math.random() - .5) * 6, up = (14 + Math.random() * 18) * power;
      d.animate([
        { transform: 'translate(0,0)', opacity: 0 },
        { transform: `translate(${dx * .5}px, ${-up}px)`, opacity: 1, offset: .4 },
        { transform: `translate(${dx}px, 6px)`, opacity: 0 },
      ], { duration: 700, delay: i * 20, easing: 'ease-out', fill: 'both' }).onfinish = () => d.remove();
    }
  }


  /* ⑧ 물속 느낌표 물고기 떼
        - 처음 연출: 빈 바늘이 내려오면 몰려들고, 가장 가까운 한 마리가 와서 걸림
        - 그 뒤 물고기 달린 바늘을 담그면 근처 물고기들이 피함 */
  const FISH_D = 'M-14 12 Q-14 0 0 0 Q14 0 14 12 L6.5 58 L12 69 L0 63.5 L-12 69 L-6.5 58 Z';
  const school = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const LOOKS = [                                    // 바늘 물고기와 같은 흑백 톤, 몸 전체 한 색
    { fill: '#2b2b2b' }, { fill: '#1e1e1e' }, { fill: '#3c3c3c' },
    { fill: '#4d4d4d' }, { fill: '#2b2b2b' }, { fill: '#5a5a5a' },
  ];
  const HOOK_LOOK = { fill: '#2b2b2b' };
  let hookedLook = HOOK_LOOK;
  let hasFish = true, scared = 0, hookWasIn = false;

  function viewBounds() {
    const m = svg.getScreenCTM();
    if (!m) return { l: -300, r: 700, b: 600 };
    const inv = m.inverse();
    const a = new DOMPoint(0, 0).matrixTransform(inv), b = new DOMPoint(innerWidth, innerHeight).matrixTransform(inv);
    return { l: a.x, r: b.x, b: b.y };
  }
  let vb = viewBounds();
  addEventListener('resize', () => { vb = viewBounds(); });
  const TOP = 455;                                   // 몸이 커서 수면보다 조금 아래로
  const depthMax = () => Math.max(TOP + 40, Math.min(vb.b - 30, 600));

  const attr = (el, o) => { Object.entries(o).forEach(([k, v]) => el.setAttribute(k, v)); return el; };
  function makeFish(look) {
    const g = document.createElementNS(NS, 'g');
    const inner = attr(document.createElementNS(NS, 'g'), { transform: 'translate(0 -40)' });   // 몸 가운데가 회전축
    inner.appendChild(attr(document.createElementNS(NS, 'path'), { d: FISH_D, fill: look.fill }));
    inner.appendChild(attr(document.createElementNS(NS, 'circle'), { cx: 4.5, cy: 12, r: 2.4, fill: '#f6f6f4' }));
    inner.appendChild(attr(document.createElementNS(NS, 'circle'), { cx: 0, cy: 86, r: 8.5, fill: look.fill }));
    g.appendChild(inner);
    $('school').appendChild(g);
    return g;
  }
  function addFish(look, x, y, a, extra = {}) {
    const dir = Math.random() < .5 ? -1 : 1;
    const f = {
      look, g: makeFish(look), s: rnd(.85, 1.05),      // 바늘 물고기(1.0)와 비슷한 크기
      x, y, vx: dir * .4, vy: 0, a: a ?? (dir > 0 ? 90 : -90),
      wander: dir > 0 ? 0 : Math.PI, cruise: rnd(.25, .55), dash: rnd(2.4, 3.4),
      ring: rnd(45, 80), orbit: rnd(0, Math.PI * 2), phase: rnd(0, 9),
      flee: 0, reach: rnd(300, 560), ...extra,
    };
    school.push(f);
    return f;
  }
  const N = innerWidth < 700 ? 5 : 8;
  for (let i = 0; i < N; i++) addFish(LOOKS[i % LOOKS.length], rnd(vb.l + 40, vb.r - 40), rnd(TOP, depthMax()));
  // 처음 낚일 물고기: 바늘이 내려올 자리 근처에서 헤엄치고 있음
  Object.assign(school[0], { x: 200 + (Math.random() < .5 ? -1 : 1) * rnd(70, 150), y: rnd(490, 540) });
  let introBiter = null, introDone = false;
  const INTRO_BITE_BY = 4950;                        // 바늘이 올라가기 직전까지는 꼭 물게

  // 바늘에 걸린 물고기(#fish)의 생김새 바꾸기
  const fishParts = $('fish').querySelectorAll('path, circle');   // 몸, 눈, 점
  function setHookedLook(look) {
    hookedLook = look;
    fishParts[0].setAttribute('fill', look.fill);
    fishParts[2].setAttribute('fill', look.fill);
  }
  function struggle(ms) {                            // 물었을 때 파닥파닥
    const w = $('fish').querySelector('.wig');
    w.style.animationDuration = '.32s';
    setTimeout(() => { w.style.animationDuration = ''; }, ms);
  }

  function hookPoint() {
    const r = $('barb').getBoundingClientRect(), m = svg.getScreenCTM();
    if (!m || !r.width) return null;
    return new DOMPoint(r.x + r.width / 2, r.y + r.height / 2).matrixTransform(m.inverse());
  }
  function hookedFishCenter() {
    const r = fishParts[0].getBoundingClientRect(), m = svg.getScreenCTM();
    return new DOMPoint(r.x + r.width / 2, r.y + r.height / 2).matrixTransform(m.inverse());
  }

  // 처음 연출에서 물고기가 바늘을 물고 걸림
  function introBite(f) {
    introDone = true; introBiter = null;
    school.splice(school.indexOf(f), 1);
    f.g.remove();
    setHookedLook(f.look);
    $('fish').style.opacity = 1;
    struggle(1100);
    const h = hookPoint();
    school.forEach((o) => { o.flee = 30; o.from = h; });
  }

  // 걸리러 오는 물고기: 바늘 물고기 자리로 헤엄쳐 와서 머리를 위로 세움
  function steerIntroBiter(f, t) {
    const c = hookedFishCenter();
    const dx = c.x - f.x, dy = c.y - f.y, dist = Math.hypot(dx, dy);
    const speed = Math.min(3, dist * .06 + .2);
    f.vx += (dx / (dist || 1) * speed - f.vx) * .08;
    f.vy += (dy / (dist || 1) * speed - f.vy) * .08;
    f.x += f.vx; f.y += f.vy;
    f.s += (1 - f.s) * .1;                           // 바늘 물고기와 같은 크기로
    // 멀 땐 가는 방향, 가까워지면 바늘에 꿰이는 자세(머리 위)로
    const want = dist > 70 ? Math.atan2(f.vy, f.vx) * 180 / Math.PI + 90 : ang;
    const d = ((want - f.a + 540) % 360) - 180;
    f.a += clamp(d * (dist > 70 ? .08 : .12), -3, 3);
    const wig = Math.sin(t / 200 + f.phase) * Math.min(3.5, 1 + dist * .02);
    f.g.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${(f.a + wig).toFixed(1)}) scale(${f.s.toFixed(3)})`);
    const late = performance.now() - t0 > INTRO_BITE_BY;
    if ((dist < 10 && Math.abs(d) < 12) || late) introBite(f);
  }

  function stepSchool(t) {
    const h = hookPoint();
    const hookIn = !!h && h.y > WATER + 4;

    // 처음 연출: 바늘이 올라가면 몰려든 물고기들이 흩어짐
    if (!following && !hookIn && hookWasIn) school.forEach((f) => { f.flee = 40; f.from = h; });
    hookWasIn = hookIn;
    if (scared > 0) scared--;
    // 처음 연출: 바늘이 물에 들어오면 가장 가까운 물고기가 걸리러 옴
    if (!following && !introDone && hookIn && !introBiter) {
      introBiter = school.reduce((a, b) => (Math.hypot(a.x - h.x, a.y - h.y) < Math.hypot(b.x - h.x, b.y - h.y) ? a : b));
    }
    // 처음 연출 땐 몰려들기, 그 뒤로는 빈 바늘일 때만
    const lure = hookIn && scared === 0 && ((!following && !revealing) || !hasFish);
    const bottom = depthMax();

    for (const f of [...school]) {
      if (f === introBiter) { steerIntroBiter(f, t); continue; }
      let dx = 0, dy = 0, speed = f.cruise, agility = .03, faceHook = false;
      const hx = h ? h.x - f.x : 0, hy = h ? h.y - f.y : 0, dist = Math.hypot(hx, hy);
      // 물고기 달린 바늘이 다가오면 피함
      if (following && hookIn && hasFish && dist < 170 && f.flee === 0) { f.flee = 30; f.from = h; }

      if (f.flee > 0) {
        // 화들짝 도망
        f.flee--;
        const fx = f.from ? f.x - f.from.x : f.vx, fy = f.from ? f.y - f.from.y : 0;
        dx = fx || 1; dy = fy * .25;
        speed = .8 + f.flee * .035; agility = .05;
      } else if (lure && dist < f.reach) {
        // 달려들어 바늘 둘레를 돌며 톡톡 쪼기
        f.orbit += .012;
        const peck = Math.max(0, Math.sin(t / 520 + f.phase)) * 10;   // 천천히, 살짝만 다가갔다 물러남
        const r = f.ring - peck;
        const tx = h.x + Math.cos(f.orbit) * r, ty = Math.max(TOP, h.y + 30 + Math.sin(f.orbit) * r * .6);
        dx = tx - f.x; dy = ty - f.y;
        speed = Math.min(f.dash, Math.hypot(dx, dy) * .05 + .2);   // 가까울수록 천천히
        agility = .05;
        faceHook = dist < f.ring + 45;
      } else {
        // 느긋하게 헤엄 (주로 가로)
        f.wander += (Math.random() - .5) * .12;
        dx = Math.cos(f.wander); dy = Math.sin(f.wander) * .25;
        if (f.x < vb.l + 30) f.wander = 0;
        if (f.x > vb.r - 30) f.wander = Math.PI;
        if (f.y < TOP + 30) dy += (TOP + 30 - f.y) / 60;
        if (f.y > bottom - 30) dy -= (f.y - bottom + 30) / 60;
      }
      const len = Math.hypot(dx, dy) || 1;
      f.vx += (dx / len * speed - f.vx) * agility;
      f.vy += (dy / len * speed - f.vy) * agility * .6;   // 세로로는 더 묵직하게 → 위아래 떨림 방지
      f.x += f.vx; f.y += f.vy;
      if (f.y < TOP - 10) { f.y = TOP - 10; f.vy = Math.max(0, f.vy); }
      if (f.y > bottom + 40) { f.y = bottom + 40; f.vy = Math.min(0, f.vy); }
      if (f.x < vb.l - 120) f.x = vb.l - 120;   // 화면 밖으로 너무 멀리 가지 않게
      if (f.x > vb.r + 120) f.x = vb.r + 120;

      const want = (faceHook ? Math.atan2(hy, hx) : Math.atan2(f.vy, f.vx)) * 180 / Math.PI + 90;
      const v = Math.hypot(f.vx, f.vy);
      const d = ((want - f.a + 540) % 360) - 180;
      const turn = faceHook ? .06 : .05 * Math.min(1, v / .4);   // 느릴 땐 거의 안 돎
      f.a += clamp(d * turn, -2.5, 2.5);                           // 한 프레임에 최대 2.5°
      const wig = Math.sin(t / (420 - Math.min(v, 3) * 60) + f.phase) * Math.min(4, 1.5 + v * .8);   // 꼬리짓은 작고 느리게
      f.g.setAttribute('transform', `translate(${f.x.toFixed(1)} ${f.y.toFixed(1)}) rotate(${(f.a + wig).toFixed(1)}) scale(${f.s})`);
    }
  }
  stepSchool(0);

  let swayK = 1;
  (function sway(t) {
    if (!alive) return;
    if (!following && !leaving && !reduced && performance.now() - t0 > FOLLOW_AT) startFollow();
    if (following) stepFollow();
    if (revealing) stepReveal(performance.now());
    if (!reduced) stepSchool(t);
    ax += ((following || revealing ? 0 : tx) - ax) * 0.04;   // 따라갈 땐 전체 흔들림은 잔잔하게만
    swayK += ((revealing ? 0 : 1) - swayK) * 0.08;           // 나갈 땐 흔들림을 서서히 멈춤
    $('sway').style.transform = `rotate(${(ax + Math.sin(t / 1400) * 0.6) * swayK}deg)`;
    requestAnimationFrame(sway);
  })(0);

  /* 클릭하면 — ① 걸린 물고기가 바늘을 물속 깊이 끌고 들어감
               ② 깊은 곳에서 큰 물고기가 덥석 → 줄이 툭
               ③ 큰 물고기를 끌어올려 화면 위쪽에 매달고, 두 번째 문구 + 이따금 팔딱팔딱
     한 번 더 클릭하면 — ④ 바늘이 물고기를 화면 위로 끌어올리고 인트로가 서서히 사라지며 메인으로 */
  const ease = (x) => (x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const DIVE = 1300, WAIT = 650, LIFT = 1900, EXIT = 1500;
  const BG_DELAY = 1000, BG_FADE = 1800;            // 메인은 물고기가 거의 빠져나간 뒤에 천천히 드러남
  const BIG = 1.8;                                   // 큰 물고기 크기 (물속 물고기 ≈ 1)
  const fishInner = $('fish').firstElementChild;     // <g transform="translate(200 340)">
  const fade = (el, to, o = {}) => el && el.animate([{ opacity: getComputedStyle(el).opacity }, { opacity: to }],
    { duration: 600, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards', ...o });
  const rise = (el, delay) => el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
    { delay, duration: 900, easing: 'cubic-bezier(.45,0,.25,1)', fill: 'forwards' });

  let gone = false;
  function leaveNow(ms = 800) {                      // 바로 사라짐 (움직임 줄이기 / SKIP)
    if (gone) return;
    gone = leaving = true; revealing = false;
    intro.style.pointerEvents = 'none';              // 사라지는 동안에도 메인을 바로 쓸 수 있게
    const f = intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'ease', fill: 'forwards' });
    f.onfinish = () => { alive = false; intro.remove(); };
  }

  function enter() {
    if (rv && rv.hangT && !rv.exitT && performance.now() - rv.hangT > 900) return exitToMain();
    if (leaving) return;
    leaving = true;
    if (reduced) return leaveNow();
    if (!following) {                                // 처음 연출 중이면 지금 위치에서 이어받음
      const tr = getComputedStyle(rig).transform;
      pos = { x: 0, y: tr && tr !== 'none' ? new DOMMatrix(tr).f : 0 };
      rigAnim.cancel();
      anims.forEach((a) => { if (a !== rigAnim) a.finish(); });
      introBiter = null;
      if (!introDone) { introDone = true; hasFish = false; $('fish').style.opacity = 0; }
      rig.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    }
    following = false;
    revealing = true;
    intro.style.cursor = 'default';
    [$('introTitle'), $('introSub'), $('introHint')].forEach((el) => fade(el, 0, { duration: 450 }));
    // 문구가 사라지면 물고기들이 다시 나타나 내려가는 바늘 쪽으로
    const sc = $('school');
    if (schoolOut.playState !== 'finished') schoolOut.pause();
    fade(sc, 1, { delay: 150 });
    const m0 = svg.getScreenCTM();
    rv = {
      t: performance.now(), m0, x0: pos.x, y0: pos.y, a0: ang,
      deep: (innerHeight + 220 - m0.f) / m0.d - PIVOT_Y,   // 바늘 고리가 화면 아래 220px
      rest: (innerHeight * .1 - m0.f) / m0.d - PIVOT_Y,    // 낚은 뒤 바늘 고리가 화면 위 10% 지점
    };
  }

  function exitToMain() {
    rv.exitT = performance.now();
    rv.exitY = pos.y;
    intro.style.cursor = 'default';
    [$('introTitle2'), $('introSub2'), $('introHint'), $('introSkip')].forEach((el) => fade(el, 0, { duration: 450 }));
    [$('introCurtain'), $('water'), $('school'), $('splash')].forEach((el) =>
      fade(el, 0, { delay: BG_DELAY, duration: BG_FADE, easing: 'cubic-bezier(.45,0,.55,1)' }));
  }

  // 매달린 물고기: 평소엔 잔잔히, 이따금 짧게 팔딱
  function flap(now) {
    if (!rv.flapAt) rv.flapAt = now + 900;
    let rot = 0, hop = 0;
    const b = now - rv.flapAt, LEN = 560;
    if (b > 0 && b < LEN) {
      const u = b / LEN;
      rot = Math.sin(u * Math.PI * 4) * 9 * (1 - u);     // 몸을 두세 번 휙휙
      hop = Math.sin(u * Math.PI) * 5;                   // 살짝 튀어 오름
    } else if (b >= LEN) rv.flapAt = now + rnd(1500, 2800);
    $('fish').style.transform = rot ? `rotate(${rot.toFixed(2)}deg)` : '';
    return { hop, sway: rot * .15 };
  }

  function stepReveal(now) {
    const e = now - rv.t, m0 = rv.m0, H = innerHeight;

    if (rv.exitT) {
      // ④ 화면 위로 끌어올리며 메인으로
      const c = Math.min(1, (now - rv.exitT) / EXIT), k = c * c * c;
      const endY = (-(45 + 95 * BIG) * m0.d - 60 - m0.f) / m0.d - PIVOT_Y;
      pos.y = rv.exitY + (endY - rv.exitY) * k;
      ang *= .9;
      flap(now);
      if (now - rv.exitT > Math.max(EXIT, BG_DELAY + BG_FADE)) { alive = false; revealing = false; intro.remove(); return; }
    } else if (e < DIVE) {
      // ① 걸린 물고기가 끌고 들어감 — 바늘·줄은 흔들지 않고, 처음엔 천천히 점점 빠르게
      if (rv.pulled === undefined) { rv.pulled = hasFish; if (hasFish) struggle(DIVE + WAIT); }
      const q = e / DIVE;
      const f = rv.pulled ? q * q * (1.6 - .6 * q) : ease(Math.min(1, e / 900));
      pos.x = rv.x0 * (1 - f); pos.y = rv.y0 + (rv.deep - rv.y0) * f; ang = rv.a0 * (1 - f);
      if (!rv.splashed && PIVOT_Y + pos.y + (rv.pulled ? 75 : 40) > WATER) {   // 물에 들어가는 순간
        rv.splashed = true;
        splashAt(PIVOT_X + pos.x, rv.pulled ? 4 : 3);
        const h = hookPoint();
        if (rv.pulled) school.forEach((o) => { o.flee = 60; o.from = h; });
      }
    } else if (e < DIVE + WAIT) {
      // ② 깊은 곳에서 큰 물고기가 덥석 → 줄이 툭
      pos.y = rv.deep; ang = 0;
      const b = e - DIVE - 200;
      if (b > 0 && !rv.big) {
        rv.big = true; hasFish = true; scared = 1e9;
        setHookedLook({ fill: '#1e1e1e' });
        fishInner.setAttribute('transform', `translate(200 340) scale(${BIG})`);
        $('fish').style.opacity = 1;
        struggle(5000);
        const h = hookPoint();
        school.forEach((f) => { f.flee = 80; f.from = h; });
        splashAt(PIVOT_X, 1.4);
      }
      pos.x = b > 0 ? Math.sin(b / 60) * 2.5 * Math.max(0, 1 - b / 380) : 0;
    } else if (e < DIVE + WAIT + LIFT) {
      // ③ 끌어올려 화면 위쪽에 멈춤
      const c = (e - DIVE - WAIT) / LIFT;
      const k = c < .35 ? (c / .35) * (c / .35) * .3 : .3 + .7 * (1 - Math.pow(1 - (c - .35) / .65, 3));   // 묵직하게 출발 → 천천히 멈춤
      pos.x = 0; ang = 0;
      pos.y = rv.deep + (rv.rest - rv.deep) * k;
      if (!rv.out && PIVOT_Y + pos.y + 45 + 48 * BIG < WATER) {       // 물고기 몸통이 수면을 지남
        rv.out = true;
        splashAt(PIVOT_X, 6);
        splashAt(PIVOT_X + 6, 4);
      }
    } else {
      // 매달린 채로: 두 번째 문구, 이따금 팔딱
      if (!rv.hangT) {
        rv.hangT = now;
        $('fish').querySelector('.wig').style.animationDuration = '';   // 평소 꼬리짓으로
        fade($('school'), 0, { duration: 1200 });                       // 문구와 겹치지 않게
        rise($('introTitle2'), 150);
        rise($('introSub2'), 300);
        fade($('introHint'), 1, { delay: 1000, duration: 800 });
        intro.style.cursor = '';
      }
      const s2 = now - rv.hangT;
      const settle = Math.sin(s2 / 160) * 5 * Math.exp(-s2 / 450);       // 멈출 때 살짝 출렁
      const { hop, sway } = flap(now);
      pos.x = 0;
      pos.y = rv.rest + settle - hop;
      ang = sway;
    }
    rig.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${ang}deg)`;
  }

  // SKIP: 어느 단계에서든 바로 메인으로 (짧게 0.25초만 흐려짐)
  $('introSkip').addEventListener('click', (e) => { e.stopPropagation(); leaveNow(250); });
  $('introSkip').addEventListener('wheel', (e) => e.stopPropagation());

  intro.addEventListener('click', enter);
  intro.addEventListener('wheel', (e) => { e.preventDefault(); if (e.deltaY > 0) enter(); }, { passive: false });
  // 인트로가 떠 있는 동안 메인 페이지 키보드 조작 막기
  window.addEventListener('keydown', (e) => {
    if (!document.body.contains(intro)) return;
    e.stopImmediatePropagation();
    if (['Enter', ' ', 'ArrowDown', 'Escape'].includes(e.key)) { e.preventDefault(); enter(); }
  }, true);
})();
