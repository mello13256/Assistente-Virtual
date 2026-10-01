/* Assistente Virtual: página de download.
   O orbe é o mesmo do app (Orb.paintEvent em assistente/qt_ui.py), portado para <canvas>. */
(() => {
  "use strict";

  const REPO = "mello13256/Assistente-Virtual";
  const LATEST = `https://github.com/${REPO}/releases/latest/download/`;
  const isWindows = /Windows/i.test(navigator.userAgent);
  const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  // ================================================================== logo
  // O olho de cada logo olha para o mouse (ou para o dedo) e pisca a cada 45 s.
  // O SVG é o próprio logo.svg, posto inline para dar para mexer na íris.
  const BLINK_EVERY = 45000;
  const LOOK_X = 118, LOOK_Y = 50;              // quanto a íris anda, em unidades do viewBox
  const EYE_Y = 5, LID_PIVOT = 95;               // centro do olho e ponto onde as pálpebras se encontram
  (async () => {
    const hosts = $$("[data-logo]");
    if (!hosts.length) return;
    let src;
    try {
      const r = await fetch("logo.svg");
      if (!r.ok) return;
      src = await r.text();
    } catch { return; }                          // sem rede ou file://: fica a <img>
    const eyes = hosts.map((host, i) => {
      // ids únicos por cópia, senão os gradientes de uma logo escondida somem nas outras
      host.innerHTML = src.replace(/(id="|url\(#)lg-/g, `$1lg${i}-`);
      const svg = $("svg", host);
      svg.removeAttribute("role"); svg.removeAttribute("aria-label");
      svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
      return {
        svg, iris: $(".lg-iris", svg), pupil: $(".lg-pupil", svg), shine: $(".lg-shine", svg),
        lids: [$(".lg-white", svg), $(`#lg${i}-eyeclip`, svg), $(".lg-lid", svg)], lid: $(".lg-lid", svg),
        x: 0, y: 0, drawn: "",
      };
    });

    let mx = null, my = null;
    const aim = (e) => { mx = e.clientX; my = e.clientY; };
    window.addEventListener("pointermove", aim, { passive: true });
    window.addEventListener("pointerdown", aim, { passive: true });

    let blinkAt = -1;
    setInterval(() => { blinkAt = performance.now(); }, BLINK_EVERY);
    const lidOpen = (now) => {                   // 1 = aberto, ~0 = fechado
      if (blinkAt < 0) return 1;
      const t = now - blinkAt;
      if (t >= 260) { blinkAt = -1; return 1; }
      if (t < 100) return 1 - 0.95 * Math.sin((t / 100) * Math.PI / 2);
      if (t < 140) return 0.05;
      return 0.05 + 0.95 * Math.sin(((t - 140) / 120) * Math.PI / 2);
    };

    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(64, now - last); last = now;
      const ease = REDUCED ? 1 : 1 - Math.exp(-dt / 70);
      const open = lidOpen(now);
      for (const e of eyes) {
        const r = e.svg.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
        let tx = 0, ty = 0;
        if (mx !== null) {
          const cx = r.left + r.width / 2, cy = r.top + r.height * (480 + EYE_Y) / 960;
          const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
          if (d > 0.5) {
            const k = Math.min(1, d / (r.width * 0.9 + 60));   // perto do olho, a íris anda menos
            tx = (dx / d) * LOOK_X * k; ty = (dy / d) * LOOK_Y * k;
          }
        }
        e.x += (tx - e.x) * ease; e.y += (ty - e.y) * ease;
        const nx = Math.abs(e.x) / LOOK_X, ny = Math.abs(e.y) / LOOK_Y;
        const key = `${e.x.toFixed(1)},${e.y.toFixed(1)},${open.toFixed(3)}`;
        if (key === e.drawn) continue;
        e.drawn = key;
        // olhando de lado, a íris fica um pouco "de perfil"
        e.iris.setAttribute("transform",
          `translate(${(-2 + e.x).toFixed(1)} ${(8 + e.y).toFixed(1)}) scale(${(1 - 0.1 * nx).toFixed(3)} ${(1 - 0.06 * ny).toFixed(3)})`);
        e.pupil.setAttribute("transform", `translate(${(e.x * 0.07).toFixed(1)} ${(e.y * 0.07).toFixed(1)})`);
        e.shine.setAttribute("transform", `translate(${(-e.x * 0.06).toFixed(1)} ${(-e.y * 0.06).toFixed(1)})`);
        const lid = open < 1 ? `translate(0 ${LID_PIVOT}) scale(1 ${open.toFixed(3)}) translate(0 ${-LID_PIVOT})` : "";
        e.lids.forEach((el) => (lid ? el.setAttribute("transform", lid) : el.removeAttribute("transform")));
        e.lid.setAttribute("opacity", Math.max(0, Math.min(1, (0.6 - open) / 0.4)).toFixed(2));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })();

  // ================================================================== orbe
  const STATE_COLORS = {
    ocioso: ["#6c8cff", "#a46bff"], ouvindo: ["#3ddc97", "#35c2ff"], pensando: ["#6c8cff", "#a46bff"],
    falando: ["#a46bff", "#ff6bcb"], pausado: ["#59607a", "#3a4056"], alerta: ["#ff5d6c", "#ff9f5d"],
    controlando: ["#00e5ff", "#6c8cff"],
  };
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const DEG = Math.PI / 180;

  class Orb {
    constructor(canvas, state = "ocioso") {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.state = state;
      this.t = Math.random() * 4;
      this.visible = true;
      this.resize();
    }
    resize() {
      const css = this.canvas.clientWidth || 76;
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(css * dpr);
      this.canvas.height = Math.round(css * dpr);
      this.scale = (css * dpr) / 76;
    }
    set(state) { this.state = state; if (REDUCED) this.draw(); }

    conic(start, stops, cx, cy) {
      const ctx = this.ctx;
      if (!ctx.createConicGradient) return null;
      const g = ctx.createConicGradient(start, cx, cy);
      for (const [o, c] of stops) g.addColorStop(o, c);
      return g;
    }

    draw() {
      const ctx = this.ctx, t = this.t, state = this.state;
      const [a, b] = STATE_COLORS[state] || STATE_COLORS.ocioso;
      const c = 38, coreR = 19;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

      // brilho externo
      let glow = { ouvindo: 110, falando: 120, alerta: 150, pausado: 30 }[state] ?? 80;
      if (state === "alerta") glow = 90 + 70 * (0.5 + 0.5 * Math.sin(t * 10));
      const g = ctx.createRadialGradient(c, c, 0, c, c, 38);
      g.addColorStop(0, rgba(a, glow / 255));
      g.addColorStop(0.35, rgba(a, glow / 255));
      g.addColorStop(1, rgba(a, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c, c, 38, 0, Math.PI * 2); ctx.fill();

      ctx.lineCap = "round";
      if (state === "ouvindo") {                         // ondas saindo
        for (let k = 0; k < 3; k++) {
          const phase = (t * 0.9 + k / 3) % 1;
          ctx.strokeStyle = rgba(a, (200 * (1 - phase)) / 255);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(c, c, coreR + phase * 17, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (state === "pensando") {                 // arco girando
        const grad = this.conic(t * 300 * DEG, [[0, rgba(a, 0)], [0.3, rgba(a, 0)], [0.65, a], [1, b]], c, c);
        ctx.strokeStyle = grad || a;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        if (grad) ctx.arc(c, c, coreR + 7, 0, Math.PI * 2);
        else ctx.arc(c, c, coreR + 7, t * 5, t * 5 + 2.2);
        ctx.stroke();
      } else if (state === "controlando") {              // dois arcos em sentidos opostos
        [[420, coreR + 6, a], [-260, coreR + 11, b]].forEach(([speed, radius, col]) => {
          const grad = this.conic(-t * speed * DEG, [[0, rgba(col, 0)], [0.55, rgba(col, 0)], [1, col]], c, c);
          ctx.strokeStyle = grad || col;
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          if (grad) ctx.arc(c, c, radius, 0, Math.PI * 2);
          else ctx.arc(c, c, radius, -t * speed * DEG, -t * speed * DEG + 2.4);
          ctx.stroke();
        });
      }

      // núcleo
      let breathe = state === "ocioso" || state === "pensando" ? 1 + 0.045 * Math.sin(t * 1.8) : 1;
      if (state === "alerta") breathe = 1 + 0.08 * Math.sin(t * 10);
      const r = coreR * breathe;
      const core = ctx.createLinearGradient(c - r, c - r, c + r, c + r);
      core.addColorStop(0, a); core.addColorStop(1, b);
      ctx.fillStyle = core;
      ctx.strokeStyle = "rgba(255,255,255,.16)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      const sx = c - r * 0.45 + 0.5, sy = c - r * 0.55 + 0.5;
      const shine = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.9);
      shine.addColorStop(0, "rgba(255,255,255,.35)"); shine.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = shine;
      ctx.beginPath(); ctx.arc(c, c, r, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,.92)";
      if (state === "falando") {                         // barras de áudio
        const n = 5, w = 3.2, gap = 2.6, total = n * w + (n - 1) * gap;
        for (let i = 0; i < n; i++) {
          const h = 6 + 12 * (0.5 + 0.5 * Math.sin(t * 11 + i * 1.3)) * (0.6 + 0.4 * Math.sin(t * 3.1 + i));
          roundRect(ctx, c - total / 2 + i * (w + gap), c - h / 2, w, h, 1.6);
        }
      } else if (state === "pausado") {
        roundRect(ctx, c - 6, c - 7, 4, 14, 1.5); roundRect(ctx, c + 2, c - 7, 4, 14, 1.5);
      } else if (state === "controlando") {              // seta de mouse
        const ox = c - 5, oy = c - 9;
        const pts = [[0, 0], [0, 16], [4, 12.5], [7, 18.5], [9.6, 17.3], [6.8, 11.4], [12, 11.4]];
        ctx.beginPath();
        pts.forEach(([dx, dy], i) => (i ? ctx.lineTo(ox + dx, oy + dy) : ctx.moveTo(ox + dx, oy + dy)));
        ctx.closePath(); ctx.fill();
      } else {                                           // olho que pisca de vez em quando
        let blink = 1;
        const cycle = t % 5.2;
        if (cycle < 0.14) blink = Math.abs(Math.cos((cycle / 0.14) * Math.PI));
        ctx.beginPath(); ctx.ellipse(c, c, 7.5, Math.max(1.2, 7.5 * blink), 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgb(20,22,34)";
        const look = Math.sin(t * 0.7) * 1.8;
        ctx.beginPath(); ctx.ellipse(c + look, c, 3.2, Math.max(0.3, 3.2 * blink), 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  const orbs = [];
  const makeOrb = (id, state) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const orb = new Orb(el, state);
    orbs.push(orb);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { orb.visible = e.isIntersecting; }).observe(el);
    }
    return orb;
  };
  const stageOrb = makeOrb("stageOrb", "ocioso");
  const bigOrb = makeOrb("bigOrb", "ocioso");
  orbs.forEach((o) => o.draw());
  window.addEventListener("resize", () => orbs.forEach((o) => { o.resize(); o.draw(); }));

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!document.hidden) for (const o of orbs) if (o.visible) { o.t += dt; o.draw(); }
    requestAnimationFrame(frame);
  }
  if (!REDUCED) requestAnimationFrame(frame);

  // ================================================================== texto com **negrito** e `código`
  function segments(md) {
    const out = [];
    md.split(/(\*\*[^*]+\*\*|`[^`]+`)/).forEach((p) => {
      if (!p) return;
      if (p.startsWith("**")) out.push({ tag: "b", text: p.slice(2, -2) });
      else if (p.startsWith("`")) out.push({ tag: "code", text: p.slice(1, -1) });
      else out.push({ tag: null, text: p });
    });
    return out;
  }
  const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  function renderPrefix(segs, n) {
    let html = "", left = n;
    for (const s of segs) {
      if (left <= 0) break;
      const part = esc(s.text.slice(0, left));
      left -= s.text.length;
      html += s.tag ? `<${s.tag}>${part}</${s.tag}>` : part;
    }
    return html;
  }
  const plainLength = (segs) => segs.reduce((n, s) => n + s.text.length, 0);

  // ================================================================== palco do hero
  const stage = $("#stage");
  const toast = $("#toast");
  const URG = { alta: ["var(--alta)", "ALERTA"], media: ["var(--media)", "DICA"], baixa: ["var(--baixa)", "COMENTÁRIO"], info: ["var(--muted)", "INFO"] };
  let run = 0;
  const sleep = (ms, id) => new Promise((ok, fail) => setTimeout(() => (id === run ? ok() : fail(new Error("cancelado"))), REDUCED ? Math.min(ms, 400) : ms));

  async function showToast(message, urgency, id, visibleMs = 6500) {
    const [color, label] = URG[urgency];
    toast.style.setProperty("--u", color);
    $("#toastChip").textContent = label;
    toast.classList.toggle("pulse", urgency === "alta");
    const text = $("#toastText");
    const segs = segments(message);
    const total = plainLength(segs);
    const instant = urgency === "alta" || total < 24 || REDUCED;
    text.innerHTML = instant ? renderPrefix(segs, total) : "";
    const bar = $("#toastProgress");
    bar.style.transition = "none";
    bar.style.transform = "scaleX(1)";
    toast.classList.add("show");
    if (!instant) {
      for (let n = 1; n <= total; n += 2) {
        text.innerHTML = renderPrefix(segs, n);
        await sleep(21, id);                               // ~95 caracteres por segundo, como no app
      }
      text.innerHTML = renderPrefix(segs, total);
    }
    void bar.offsetWidth;
    bar.style.transition = `transform ${visibleMs}ms linear`;
    bar.style.transform = "scaleX(0)";
  }
  const hideToast = () => toast.classList.remove("show");

  function setScene(name, title) {
    $$(".scene", stage).forEach((s) => s.classList.toggle("is-on", s.dataset.scene === name));
    $("#stageTitle").textContent = title;
  }

  const fix = $("#codeFix");
  const ghost = $(".ghost-cursor", stage);
  function resetCode() {
    fix.classList.remove("fixed", "typing");
    const colon = fix.querySelector(".colon");
    if (colon) colon.remove();
    ghost.style.opacity = "0";
    ghost.style.left = "82%"; ghost.style.top = "84%";
    stage.classList.remove("controlling");
  }

  const scenarios = [
    async (id) => {                                       // jogo: alerta com seta de perigo
      setScene("game", "Jogo de ação");
      stageOrb.set("ocioso");
      await sleep(1400, id);
      stageOrb.set("pensando");
      await sleep(1500, id);
      stageOrb.set("alerta");
      stage.classList.add("alert");
      await showToast("Inimigo chegando pela **esquerda**! Vira agora e usa o dash.", "alta", id, 4200);
      await sleep(2600, id);
      stageOrb.set("falando");
      await sleep(1600, id);
      stage.classList.remove("alert");
      stageOrb.set("ocioso");
      await sleep(1000, id);
      hideToast();
      await sleep(900, id);
    },
    async (id) => {                                       // código: aponta o erro e corrige
      resetCode();
      setScene("code", "main.py · Visual Studio Code");
      stageOrb.set("ocioso");
      await sleep(1300, id);
      stageOrb.set("pensando");
      await sleep(1300, id);
      stageOrb.set("falando");
      await showToast("No **main.py**, linha 3: faltou `:` depois do `for`. Quer que eu corrija?", "baixa", id, 5200);
      await sleep(1500, id);
      stageOrb.set("ouvindo");
      await sleep(1300, id);
      hideToast();
      stageOrb.set("controlando");
      stage.classList.add("controlling");
      await sleep(500, id);
      const body = $(".stage-body", stage).getBoundingClientRect();
      const box = fix.getBoundingClientRect();
      ghost.style.opacity = "1";
      await sleep(80, id);
      ghost.style.left = `${box.left - body.left - 7}px`;
      ghost.style.top = `${box.top - body.top + box.height / 2 - 11}px`;
      await sleep(1000, id);
      ghost.classList.remove("click"); void ghost.offsetWidth; ghost.classList.add("click");
      fix.classList.add("typing");
      await sleep(650, id);
      const colon = document.createElement("span");
      colon.className = "colon";
      colon.textContent = ":";
      fix.insertBefore(colon, fix.firstChild);
      fix.classList.add("fixed");
      await sleep(700, id);
      fix.classList.remove("typing");
      ghost.style.opacity = "0";
      stage.classList.remove("controlling");
      stageOrb.set("falando");
      await showToast("Pronto: 1 mudança em main.py. Ctrl+Z desfaz.", "info", id, 3400);
      await sleep(2000, id);
      stageOrb.set("ocioso");
      await sleep(1600, id);
      hideToast();
      await sleep(900, id);
    },
    async (id) => {                                       // navegador: página com cara de golpe
      setScene("web", "Navegador");
      stageOrb.set("ocioso");
      await sleep(1400, id);
      stageOrb.set("pensando");
      await sleep(1500, id);
      stageOrb.set("falando");
      await showToast("Essa página tem cara de **golpe**: domínio estranho e pressa para pedir seus dados do banco. Melhor não preencher.", "media", id, 6000);
      await sleep(2400, id);
      stageOrb.set("ocioso");
      await sleep(3000, id);
      hideToast();
      await sleep(900, id);
    },
  ];

  const legend = $$("#stageLegend button");
  async function play(start) {
    const id = ++run;
    let i = start;
    hideToast();
    stage.classList.remove("alert", "controlling");
    try {
      for (;;) {
        legend.forEach((b, k) => b.classList.toggle("on", k === i));
        await scenarios[i](id);
        i = (i + 1) % scenarios.length;
      }
    } catch { /* outro cenário começou */ }
  }
  legend.forEach((b) => b.addEventListener("click", () => play(Number(b.dataset.go))));
  if (stage && stageOrb) play(0);

  // ================================================================== estados do orbe (seção)
  const CAPTIONS = {
    ocioso: "Parado: respira devagar e pisca de vez em quando, de olho na tela.",
    ouvindo: "Ouvindo: ondas saem do orbe enquanto você fala. A frase é transcrita no seu PC.",
    pensando: "Pensando: um arco gira enquanto a IA analisa a tela ou a sua pergunta.",
    falando: "Falando: barras de áudio acompanham a voz. Comece a falar e ele cala na hora.",
    alerta: "Alerta: pulsa em vermelho quando há perigo, junto com o balão e a seta.",
    controlando: "No controle: dois arcos giram enquanto ele usa o mouse e o teclado. Esc para tudo.",
  };
  const stateBtns = $$("#orbStates button");
  let autoStates = true;
  function pickState(state) {
    bigOrb && bigOrb.set(state);
    $("#orbCaption").textContent = CAPTIONS[state];
    stateBtns.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.state === state)));
  }
  stateBtns.forEach((b) => b.addEventListener("click", () => { autoStates = false; pickState(b.dataset.state); }));
  pickState("ocioso");
  let si = 0;
  setInterval(() => {
    if (!autoStates || !bigOrb || !bigOrb.visible) return;
    si = (si + 1) % stateBtns.length;
    pickState(stateBtns[si].dataset.state);
  }, 3600);

  // ================================================================== "só pedindo"
  const log = $("#chatLog");
  const settings = { webcam: true, brilho: true, pausa: false, controle: true, modo: "auto" };
  const history = [];
  const NAMES = { webcam: "a webcam", brilho: "o brilho automático", pausa: "o lembrete 20-20-20", controle: "o controle do PC" };
  const ASKS = [
    { q: "desliga a webcam", key: "webcam", val: false, a: "Pronto: webcam desligada." },
    { q: "liga o lembrete de pausa", key: "pausa", val: true, a: "Lembrete 20-20-20 ligado. Te aviso a cada 20 minutos." },
    { q: "não reduz o brilho sozinho", key: "brilho", val: false, a: "Certo, não mexo mais no brilho." },
    { q: "modo gamer", key: "modo", val: "gamer", a: "Modo gamer ativado." },
    { q: "desliga o controle do PC", key: "controle", val: false, a: "Controle do PC desligado. Não mexo no mouse nem no teclado." },
    { q: "desfaz", undo: true },
  ];

  function bubble(kind, html, label) {
    const el = document.createElement("div");
    el.className = `bubble ${kind}`;
    el.innerHTML = (label ? `<small>${label}</small>` : "") + html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function applySetting(key, val) {
    settings[key] = val;
    const row = $(`.set-row[data-key="${key}"]`);
    if (!row) return;
    if (key === "modo") {
      $("#modeField").textContent = val;
      row.querySelector("small").textContent = val === "auto" ? "auto detecta jogos sozinho" : "análise a cada ~2,5 s";
    } else {
      const tg = row.querySelector(".toggle");
      tg.classList.toggle("on", val);
      tg.setAttribute("aria-checked", String(val));
    }
    row.classList.remove("flash"); void row.offsetWidth; row.classList.add("flash");
    setTimeout(() => row.classList.remove("flash"), 1400);
  }
  let busy = false;
  async function ask(i) {
    if (busy) return;
    busy = true;
    $$("#askChips button").forEach((b) => (b.disabled = true));
    const item = ASKS[i];
    bubble("user", esc(item.q));
    await new Promise((r) => setTimeout(r, 350));
    const dots = bubble("bot", '<span class="typing"><i></i><i></i><i></i></span>');
    dots.style.padding = "0";
    await new Promise((r) => setTimeout(r, REDUCED ? 150 : 700));
    dots.remove();
    let answer;
    if (item.undo) {
      const prev = history.pop();
      if (prev) { applySetting(prev.key, prev.val); answer = "Desfeito: voltei como estava."; }
      else answer = "Não tem nada para desfazer ainda.";
    } else if (settings[item.key] === item.val) {
      answer = item.key === "modo" ? "Já estou no modo gamer." : `${NAMES[item.key][0].toUpperCase()}${NAMES[item.key].slice(1)} já está ${item.val ? "ligado" : "desligado"}.`;
      if (item.key === "webcam") answer = `A webcam já está ${item.val ? "ligada" : "desligada"}.`;
    } else {
      history.push({ key: item.key, val: settings[item.key] });
      applySetting(item.key, item.val);
      answer = item.a;
    }
    bubble("bot", esc(answer), "Assistente · na hora, sem IA");
    busy = false;
    $$("#askChips button").forEach((b) => (b.disabled = false));
  }
  $$("#askChips button").forEach((b) => b.addEventListener("click", () => ask(Number(b.dataset.ask))));
  bubble("bot", "Oi! Dá para mudar qualquer configuração só pedindo, por voz ou aqui no chat.", "Assistente");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { io.disconnect(); setTimeout(() => ask(0), 900); }
    }, { threshold: 0.5 });
    io.observe(log);
  }

  // ================================================================== downloads
  const FALLBACK = {
    tag_name: "v0.9.11", published_at: "2026-10-01T07:48:30Z", html_url: `https://github.com/${REPO}/releases/tag/v0.9.11`,
    assets: [
      { name: "AssistenteVirtual-Instalador.exe", size: 2238959 },
      { name: "AssistenteVirtual-Setup.exe", size: 2334861 },
      { name: "AssistenteVirtual-Setup-1.bin", size: 1997664768 },
      { name: "AssistenteVirtual-Setup-2.bin", size: 1695522283 },
      { name: "AssistenteVirtual-Update.exe", size: 223844965 },
    ],
  };
  const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
  const nf0 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const human = (b) => (b >= 1024 ** 3 ? `${nf1.format(b / 1024 ** 3)} GB` : b >= 1024 ** 2 ? `${nf0.format(b / 1024 ** 2)} MB` : `${nf0.format(b / 1024)} KB`);
  const partOrder = (n) => (n.endsWith(".exe") ? 0 : Number((n.match(/-(\d+)\.bin$/) || [0, 99])[1]));
  const ICON_FILE = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>';
  const ICON_OK = '<svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg>';
  let fullFiles = [];

  function render(rel) {
    const v = String(rel.tag_name || "").replace(/^v/, "");
    const assets = (rel.assets || []).map((a) => ({ ...a, url: a.browser_download_url || LATEST + a.name }));
    fullFiles = assets.filter((a) => a.name.startsWith("AssistenteVirtual-Setup")).sort((x, y) => partOrder(x.name) - partOrder(y.name));
    const lite = assets.find((a) => a.name === "AssistenteVirtual-Update.exe");
    const boot = assets.find((a) => a.name === "AssistenteVirtual-Instalador.exe");
    const fullSize = fullFiles.reduce((n, a) => n + a.size, 0);
    const date = rel.published_at ? new Date(rel.published_at).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) : "";

    $$("[data-version-label]").forEach((el) => (el.textContent = `v${v}`));
    $$("[data-hero-sub]").forEach((el) => (el.textContent = !isWindows ? `Para Windows 10 e 11 · v${v}`
      : boot ? `Grátis · v${v} · instalador de ${human(boot.size)}` : `Grátis · v${v} · ${human(fullSize)}`));
    $("#relMeta").textContent = `Versão ${v}${date ? ` · publicada em ${date}` : ""} · Windows 10 e 11 (64 bits)`;
    $('[data-size="full"]').textContent = human(fullSize);
    $("[data-parts]").textContent = String(fullFiles.length);
    if (lite) { $('[data-size="lite"]').textContent = human(lite.size); $("#dlLite").href = lite.url; }
    // versões anteriores à 0.9.9 não têm o instalador único: fica só o download em partes
    $("#dlBoot").hidden = !boot;
    $("#dlParts").open = !boot;
    $('[data-size="boot"]').textContent = boot ? human(boot.size) : human(fullSize);
    $("[data-boot-title]").textContent = boot ? "Instalador" : "Instalação completa";
    $("[data-boot-sub]").textContent = boot ? "1 arquivo, que baixa o resto" : `em ${fullFiles.length} arquivos`;
    $("[data-boot-only]").hidden = !boot;
    if (boot) $("#dlBoot").href = boot.url;
    if (rel.html_url) $("#relNotes").href = rel.html_url;

    $("#fileList").innerHTML = fullFiles.map((a, i) => `
      <div class="file" data-i="${i}">
        <span class="file-ic">${ICON_FILE}</span>
        <span class="file-name" title="${a.digest ? esc(a.digest) : ""}">${esc(a.name)}</span>
        <span class="file-meta">${human(a.size)}</span>
        <a href="${esc(a.url)}" data-one="${i}">Baixar</a>
      </div>`).join("");
    $$("#fileList a").forEach((link) => link.addEventListener("click", () => markDone(Number(link.dataset.one))));
  }
  function markDone(i) {
    const row = $(`.file[data-i="${i}"]`);
    if (!row) return;
    row.classList.remove("busy");
    row.classList.add("done");
    row.querySelector(".file-ic").innerHTML = ICON_OK;
  }

  render(FALLBACK);
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((rel) => { if (rel && rel.assets && rel.assets.length) render(rel); })
    .catch(() => { /* sem API (limite ou offline): fica com os dados embutidos e os links /latest/ */ });

  function trigger(url) {
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  $("#dlAll").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    snack(`Baixando ${fullFiles.length} arquivos. Se o navegador perguntar, permita vários downloads.`);
    for (let i = 0; i < fullFiles.length; i++) {
      const row = $(`.file[data-i="${i}"]`);
      if (row) row.classList.add("busy");
      trigger(fullFiles[i].url);
      await new Promise((r) => setTimeout(r, 2200));
      markDone(i);
    }
    btn.disabled = false;
    snack("Pronto! Quando terminarem, abra o AssistenteVirtual-Setup.exe (os .bin ficam na mesma pasta).", 6000);
  });

  // ================================================================== contador de downloads
  // Soma os instaladores (único, completo e leve) de todas as versões; as partes .bin não contam de novo.
  function countUp(el, target) {
    if (REDUCED) { el.textContent = target.toLocaleString("pt-BR"); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - k, 3))).toLocaleString("pt-BR");
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers: { Accept: "application/vnd.github+json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((releases) => {
      if (!Array.isArray(releases)) return;
      const total = releases.reduce((sum, rel) => sum + (rel.assets || [])
        .filter((a) => /^AssistenteVirtual-(Instalador|Setup|Update)\.exe$/.test(a.name))
        .reduce((n, a) => n + (a.download_count || 0), 0), 0);
      $$("[data-count-wrap]").forEach((wrap) => { wrap.hidden = false; });
      $$("[data-count]").forEach((el) => countUp(el, total));
      $$("[data-count-wrap]").forEach((wrap) => wrap.setAttribute("title", `${total} downloads dos instaladores (único, completo e leve), somando todas as versões`));
    })
    .catch(() => { /* sem API: o contador fica escondido */ });

  // ================================================================== copiar comandos
  $$(".copy").forEach((btn) => btn.addEventListener("click", async () => {
    const text = document.getElementById(btn.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = Object.assign(document.createElement("textarea"), { value: text });
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    btn.textContent = "Copiado!";
    btn.classList.add("ok");
    snack("Cole no PowerShell (Win + X → Terminal) e aperte Enter.");
    setTimeout(() => { btn.textContent = "Copiar"; btn.classList.remove("ok"); }, 1800);
  }));

  let snackTimer;
  function snack(text, ms = 4200) {
    const el = $("#snack");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => el.classList.remove("show"), ms);
  }

  // ================================================================== navegação e entrada ao rolar
  const topbar = $(".topbar");
  const onScroll = () => topbar.classList.toggle("scrolled", window.scrollY > 8);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  const nav = $("#nav"), menuBtn = $("#menuBtn");
  menuBtn.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", String(open));
  });
  $$("#nav a").forEach((a) => a.addEventListener("click", () => { nav.classList.remove("open"); menuBtn.setAttribute("aria-expanded", "false"); }));

  if ("IntersectionObserver" in window) {
    const links = new Map($$("#nav a").map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) links.forEach((a, id) => a.classList.toggle("on", id === e.target.id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

    const reveal = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const siblings = [...e.target.parentElement.children].filter((x) => x.classList.contains("reveal"));
        e.target.style.transitionDelay = `${Math.min(6, siblings.indexOf(e.target)) * 70}ms`;
        e.target.classList.add("in");
        reveal.unobserve(e.target);
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((el) => reveal.observe(el));
  } else {
    $$(".reveal").forEach((el) => el.classList.add("in"));
  }

})();
