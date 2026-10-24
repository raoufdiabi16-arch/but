/* AIRVER — welcome-gift wheel.
   The DRAW happens on the server (Edge Function `wheel` → public.wheel_spin). This file only shows it:
   the wheel starts turning the moment you tap, waits for the server's answer, then slows down and lands exactly
   on the slice the server chose. The code is stored on this device, bound to this browser, and validated again by
   the server when the order is placed. Nothing here can change the prize. */
(function () {
  'use strict';
  var KEY = 'airver.wheel.v2', DISMISS = 'airver.wheel.dismissed', DID = 'airver.did';
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  var STYLE = { p10: ['#f3eee4', '#17171a'], p15: ['#fbfaf7', '#17171a'], p20: ['#e6e0d4', '#17171a'], p30: ['#d6efe0', '#17171a'], free: ['#0e0e10', '#9fe3bc'] };
  var FALLBACK = [['#f3eee4', '#17171a'], ['#e6e0d4', '#17171a'], ['#fbfaf7', '#17171a'], ['#d6efe0', '#17171a']];
  var $ = function (id) { return document.getElementById(id); };
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fmt = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); };
  var root, svg, disc, pointer, cfg = null, slices = [], opened = false, retry = 0, armed = false, timer = 0;

  /* ---------- this browser's identity (the code only works from here) ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = crypto.getRandomValues(new Uint8Array(16)); b[6] = b[6] & 15 | 64; b[8] = b[8] & 63 | 128;
    var h = [].map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function deviceId() {
    var id = ''; try { id = localStorage.getItem(DID) || ''; } catch (e) {}
    if (!UUID.test(id)) id = cookie(DID);
    if (!UUID.test(id)) id = uuid();
    try { localStorage.setItem(DID, id); } catch (e) {}
    document.cookie = DID + '=' + id + '; max-age=31536000; path=/; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : '');
    return id.toLowerCase();
  }

  /* ---------- the saved code ---------- */
  function read() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); return (o && o.exp > Date.now() && !o.used) ? o : null; } catch (e) { return null; } }
  function write(o) { try { if (o) localStorage.setItem(KEY, JSON.stringify(o)); else localStorage.removeItem(KEY); } catch (e) {} }
  function emit() { try { window.dispatchEvent(new CustomEvent('airver:promo')); } catch (e) {} }
  window.AirverPromo = {
    current: function () { var o = read(); return o ? { code: o.code, pct: o.pct, device: deviceId(), exp: o.exp, drop: o.drop } : null; },
    markUsed: function () { write(null); chip(); emit(); },       // the order went through: the code is spent
    invalidate: function () { write(null); chip(); emit(); }      // the server refused it: forget it
  };

  /* ---------- talking to the server ---------- */
  function api(body) {
    var c = window.AirverCfg; if (!c) return Promise.reject(new Error('cfg'));
    return fetch(c.url + '/functions/v1/wheel', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) { var e = new Error(j.error || 'HTTP'); e.code = j.error || ('HTTP_' + r.status); throw e; } return j; }); });
  }
  function loadConfig() { return api({ action: 'config', device_id: deviceId() }).then(function (c) { cfg = c; return c; }); }
  function sync(c) {              // the server is the truth about this device's code
    if (!c.active) { write(null); return; }
    var ex = c.existing;
    if (ex && !ex.expired && !ex.used) write({ drop: c.drop, code: ex.code, prize: ex.prize_id, pct: ex.pct, exp: Date.parse(ex.expires_at) });
    else write(null);
  }
  function dismissed(drop) { try { return localStorage.getItem(DISMISS) === drop; } catch (e) { return false; } }

  /* ---------- the slices (sizes follow the real odds) ---------- */
  function sortPrizes(p) { return p.slice().sort(function (a, b) { return (a.sort - b.sort) || (a.id < b.id ? -1 : 1); }); }
  function sig(list) { return list.map(function (p) { return (p.id || p.p.id) + ':' + (p.weight || p.p.weight); }).join('|'); }
  function pt(deg, r) { var t = deg * Math.PI / 180; return [50 + r * Math.sin(t), 50 - r * Math.cos(t)]; }
  function slicePath(s) { var a = pt(s.a0, 50), b = pt(s.a1, 50); return 'M50 50 L' + a[0].toFixed(3) + ' ' + a[1].toFixed(3) + ' A50 50 0 ' + (s.span > 180 ? 1 : 0) + ' 1 ' + b[0].toFixed(3) + ' ' + b[1].toFixed(3) + ' Z'; }
  function build(prizes) {
    var list = sortPrizes(prizes), total = list.reduce(function (s, p) { return s + p.weight; }, 0), a = 0, fb = 0; slices = [];
    list.forEach(function (p) { var span = p.weight / total * 360, st = STYLE[p.id] || FALLBACK[fb++ % FALLBACK.length];
      slices.push({ p: p, a0: a, a1: a + span, mid: a + span / 2, span: span, fill: st[0], ink: st[1], num: p.pct >= 100 ? 'FREE' : '\u2212' + p.pct + '%' }); a += span; });
    var h = '<defs><radialGradient id="awShade" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".08"/></radialGradient>'
          + '<filter id="awBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.1"/></filter></defs>';
    slices.forEach(function (s) {
      var wide = s.span > 50, mid = s.span > 20, big = wide ? 9.2 : (mid ? 6.6 : 4.4), free = s.p.pct >= 100;
      h += '<g class="aw-slice" data-id="' + s.p.id + '"><path d="' + slicePath(s) + '" fill="' + s.fill + '" stroke="rgba(17,17,19,.13)" stroke-width=".35"/>'
        + '<g transform="rotate(' + s.mid.toFixed(3) + ' 50 50)"><g transform="translate(50 ' + (wide ? 6.4 : 7.2) + ') rotate(-90)" fill="' + s.ink + '" text-anchor="end" style="font-family:var(--aw-num);font-weight:600">'
        + '<text y="' + (wide ? -1.4 : 0) + '" dominant-baseline="central" font-size="' + big + '" letter-spacing="' + (free ? '.14' : '-.2') + '">' + s.num + '</text>'
        + (wide ? '<text y="5.6" dominant-baseline="central" font-size="2.7" letter-spacing=".5" opacity=".62" style="font-weight:500">DELIVERY</text>' : '')
        + '</g></g></g>';
    });
    h += '<circle cx="50" cy="50" r="50" fill="url(#awShade)"/><circle cx="50" cy="50" r="49.3" fill="none" stroke="rgba(17,17,19,.10)" stroke-width=".5"/>';
    slices.forEach(function (s) { var d = slicePath(s);
      h += '<path class="aw-glow" data-glow="' + s.p.id + '" d="' + d + '" fill="none" stroke="#33b068" stroke-width="1.3" stroke-linejoin="round" filter="url(#awBlur)" style="display:none"/>'
         + '<path class="aw-glow" data-glow="' + s.p.id + '" d="' + d + '" fill="none" stroke="#8fe0b2" stroke-width=".7" stroke-linejoin="round" style="display:none"/>'; });
    svg.innerHTML = h;
  }
  function sliceOf(id) { return slices.filter(function (s) { return s.p.id === id; })[0]; }

  /* ---------- the engine: one angle, one loop ---------- */
  var rot = -50, raf = 0, last = 0, mode = 'intro', t0 = 0, from = 0, to = 0, dur = 0, onDone = null, lastIdx = -1, lastTick = 0, curV = 0;
  var VMAX = 760;
  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };
  var easeSpin = function (t) { return 1 - Math.pow(1 - t, 4.2); };          // long, soft deceleration
  var easeInOut = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  function idxAt(deg) { var d = ((-deg % 360) + 360) % 360; for (var i = 0; i < slices.length; i++) if (d >= slices[i].a0 && d < slices[i].a1) return i; return 0; }
  function paint() { svg.style.transform = 'rotate(' + rot.toFixed(3) + 'deg)'; }
  function tick(ts) { if (reduce || ts - lastTick < 70) return; lastTick = ts; pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick'); }
  function trackTicks(ts) { var i = idxAt(rot); if (lastIdx !== -1 && i !== lastIdx) tick(ts); lastIdx = i; }
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    var dt = last ? Math.min(.05, (ts - last) / 1000) : 0; last = ts;
    if (mode === 'intro') { var k = Math.min(1, (ts - t0) / 1500); rot = from + (to - from) * easeOutCubic(k); if (k >= 1) mode = 'idle'; }
    else if (mode === 'idle') { rot += dt * (reduce ? 0 : 5); }
    else if (mode === 'wind') { var kw = Math.min(1, (ts - t0) / 900); curV = 5 + (VMAX - 5) * easeInOut(kw); rot += curV * dt; trackTicks(ts); if (kw >= 1) mode = 'wait'; }
    else if (mode === 'wait') { curV = VMAX; rot += VMAX * dt; trackTicks(ts); }
    else if (mode === 'spin') {
      var ks = Math.min(1, (ts - t0) / dur); rot = from + (to - from) * easeSpin(ks); trackTicks(ts);
      if (ks >= 1) { mode = 'done'; rot = to; paint(); if (onDone) onDone(); }
    }
    paint();
  }
  function start() { if (!raf) { last = 0; raf = requestAnimationFrame(loop); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  /* ---------- spin: windup while the server decides, then land on its answer ---------- */
  function setErr(t) { var e = $('awErr'); e.textContent = t || ''; e.hidden = !t; }
  function onSpin() {
    if (mode === 'wind' || mode === 'wait' || mode === 'spin') return;
    setErr('');
    $('awSpin').disabled = true; $('awSpin').textContent = 'Spinning\u2026'; $('awSub').textContent = 'Good luck\u2026'; root.dataset.state = 'spinning'; fit();
    if (reduce) { mode = 'wait'; } else { t0 = performance.now(); mode = 'wind'; }
    var c = window.AirverCfg, tk = (c && c.token) ? c.token() : Promise.resolve('');
    Promise.resolve(tk).then(function (token) { return api({ action: 'spin', device_id: deviceId(), turnstile_token: token || '' }); })
      .then(land, fail);
  }
  function fail(e) {
    var code = e && e.code, msg = code === 'RATE_LIMIT' ? 'Too many tries from this network. Please try again later.'
      : code === 'CAPTCHA_FAILED' ? 'Security check failed. Please try again.'
      : code === 'WHEEL_INACTIVE' ? 'This gift is no longer available.' : 'We couldn\u2019t load your gift. Please try again.';
    mode = 'idle'; root.dataset.state = 'idle'; fit(); $('awSpin').disabled = false; $('awSpin').textContent = 'Spin the wheel'; $('awSub').textContent = 'Every spin wins \u2014 one spin per drop.'; setErr(msg);
  }
  function land(res) {
    var started = Date.now();
    (function go() {
      if (mode === 'wind' && Date.now() - started < 3000) return setTimeout(go, 40);       // let the windup finish first
      if (res.prizes && sig(res.prizes) !== sig(slices)) { build(res.prizes); }                // the wheel exactly as it was when the server drew
      var s = sliceOf(res.prize_id);
      if (!s) { finish(res); return; }
      var phi = s.mid + (Math.random() * .6 - .3) * s.span;                                   // inside the slice, never on its edge
      var base = ((rot % 360) + 360) % 360, need = (((-phi - base) % 360) + 360) % 360, v0 = Math.max(curV, 200), D = need, k = 1;
      if (reduce) { from = rot; to = rot + 360 + need; dur = 1200; }
      else { while ((D = need + 360 * k) * 4.2 / v0 < 4.2) k++; from = rot; to = rot + D; dur = D * 4.2 / v0; }   // starts at the speed it already has: no jolt
      lastIdx = idxAt(rot); t0 = performance.now(); mode = 'spin'; onDone = function () { finish(res); };
    })();
  }
  function finish(res) {
    var rec = { drop: cfg && cfg.drop, code: res.code, prize: res.prize_id, pct: res.pct, exp: Date.parse(res.expires_at) };
    if (res.expired || res.used) { write(null); } else { write(rec); }
    if (!res.expired && !res.used) { showWin(rec); } else { root.dataset.state = 'idle'; setErr('This gift was already claimed on this device.'); }
    emit(); chip();
    try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) {}
  }

  /* ---------- the win ---------- */
  function feeRange() {
    var f = (window.AirverCfg && window.AirverCfg.fees) || {}, v = Object.keys(f).map(function (k) { return f[k][0]; }).filter(function (x) { return x > 0; });
    return v.length ? [Math.min.apply(null, v), Math.max.apply(null, v)] : [450, 1500];
  }
  function showWin(rec) {
    var s = sliceOf(rec.prize);
    [].forEach.call(svg.querySelectorAll('.aw-glow'), function (g) { g.style.display = (s && g.getAttribute('data-glow') === rec.prize) ? '' : 'none'; });
    [].forEach.call(svg.querySelectorAll('.aw-slice'), function (g) { g.classList.toggle('is-win', !!s && g.getAttribute('data-id') === rec.prize); });
    disc.classList.toggle('has-win', !!s);
    var r = feeRange();
    $('awPrize').textContent = rec.pct >= 100 ? 'Free delivery' : rec.pct + '% off delivery';
    $('awValue').textContent = rec.pct >= 100 ? 'Worth ' + fmt(r[0]) + '\u2013' + fmt(r[1]) + ' DA depending on your wilaya.'
                                              : 'About ' + fmt(r[0] * rec.pct / 100) + '\u2013' + fmt(r[1] * rec.pct / 100) + ' DA off, depending on your wilaya.';
    $('awCode').textContent = rec.code;
    root.dataset.state = 'won'; fit(); clock();
  }
  function ms2clock(ms) { var s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60, z = function (n) { return (n < 10 ? '0' : '') + n; }; return z(h) + ':' + z(m) + ':' + z(x); }
  function clock() {
    var o = read();
    if (!o) { if (timer) { clearInterval(timer); timer = 0; } chip(); return; }
    var t = ms2clock(o.exp - Date.now()); $('awLeft').textContent = t; $('awChipTime').textContent = t;
    if (!timer) timer = setInterval(clock, 1000);
  }

  /* ---------- the chip: remembers your code (or lets you spin later) ---------- */
  function chip() {
    var c = $('awChip'); if (!c) return; var o = read();
    if (o) { $('awChipCode').textContent = o.code; $('awChipTime').textContent = ms2clock(o.exp - Date.now()); c.classList.add('is-shown'); if (!timer) timer = setInterval(clock, 1000); }
    else if (cfg && cfg.active && !cfg.existing && dismissed(cfg.drop)) { $('awChipCode').textContent = 'Welcome gift'; $('awChipTime').textContent = 'Spin'; c.classList.add('is-shown'); }
    else c.classList.remove('is-shown');
  }

  /* ---------- open / close ---------- */
  var views, vSpin, vWin;
  function fit() { var v = root.dataset.state === 'won' ? vWin : vSpin; if (v && v.offsetHeight) views.style.height = v.offsetHeight + 'px'; }
  function openWheel() {
    if (opened) return; opened = true;
    var saved = read();
    var prepare = (cfg ? Promise.resolve(cfg) : loadConfig());
    prepare.then(function (c) {
      if (!c.active) { opened = false; return; }
      if (saved) {                                         // already won: show the code, wheel parked on its slice
        build(c.prizes && c.prizes.length ? c.prizes : [{ id: saved.prize, pct: saved.pct, weight: 1, sort: 0 }]);
        var s = sliceOf(saved.prize); mode = 'done'; rot = s ? -s.mid : 0; paint(); showWin(saved);
      } else {
        build(c.prizes); root.dataset.state = 'idle'; disc.classList.remove('has-win'); setErr('');
        $('awSub').textContent = 'Every spin wins \u2014 one spin per drop.'; $('awSpin').disabled = false; $('awSpin').textContent = 'Spin the wheel';
        from = -50; to = 0; t0 = performance.now(); rot = from; mode = 'intro';
      }
      root.classList.add('is-open'); root.setAttribute('aria-hidden', 'false'); document.documentElement.classList.add('aw-lock'); fit(); start();
      setTimeout(function () { try { $(saved ? 'awShop' : 'awSpin').focus({ preventScroll: true }); } catch (e) {} }, 700);
    }).catch(function () { opened = false; });
  }
  function closeWheel() {
    if (root.dataset.state === 'spinning') return;
    root.classList.remove('is-open'); root.setAttribute('aria-hidden', 'true'); document.documentElement.classList.remove('aw-lock'); stop(); opened = false;
    if (!read() && cfg && cfg.drop) { try { localStorage.setItem(DISMISS, cfg.drop); } catch (e) {} }
    chip();
  }

  /* ---------- when to appear on its own: once the visitor reaches the products, never over another sheet ---------- */
  function blocked() {
    var g = $('entryGate'); if (g && getComputedStyle(g).display !== 'none' && getComputedStyle(g).visibility !== 'hidden' && g.offsetParent !== null) return true;
    var busy = ['#checkoutBottomSheet.is-open', '#productOverlay.is-open', '#reviewModal.is-open', '#thanksModal.is-open', '.cart-sheet.is-open'];
    for (var i = 0; i < busy.length; i++) if (document.querySelector(busy[i])) return true;
    return document.hidden;
  }
  function tryOpen() {
    clearTimeout(retry);
    if (opened || read() || !cfg || !cfg.active || cfg.existing || dismissed(cfg.drop)) return;
    if (blocked()) { retry = setTimeout(tryOpen, 2500); return; }
    openWheel();
  }
  function arm() {
    if (armed) return; armed = true;
    var rail = $('rail');
    if (rail && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[es.length - 1].isIntersecting) { io.disconnect(); setTimeout(tryOpen, 1400); } }, { threshold: [.25] });
      io.observe(rail);
    }
    setTimeout(tryOpen, 22000);                            // fallback for visitors who do not scroll
  }

  /* ---------- wire-up ---------- */
  function init() {
    root = $('aw'); if (!root) return;
    svg = $('awSvg'); disc = $('awDisc'); pointer = $('awPointer');
    views = document.querySelector('.aw-views'); vSpin = document.querySelector('.aw-view--spin'); vWin = document.querySelector('.aw-view--win');
    $('awSpin').addEventListener('click', onSpin);
    $('awClose').addEventListener('click', closeWheel); $('awLater').addEventListener('click', closeWheel);
    $('awBackdrop').addEventListener('click', closeWheel);
    $('awShop').addEventListener('click', function () { closeWheel(); var r = $('rail'); if (r && r.scrollIntoView) r.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && root.classList.contains('is-open')) closeWheel(); });
    $('awChip').addEventListener('click', function () { opened = false; openWheel(); });
    $('awCopy').addEventListener('click', function () {
      var o = read(), code = o ? o.code : $('awCode').textContent, b = $('awCopy'), t = $('awCopyTxt');
      function ok() { b.classList.add('is-done'); t.textContent = 'Saved'; setTimeout(function () { b.classList.remove('is-done'); t.textContent = 'Copy'; }, 2200); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(ok, ok);
      else { var ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} document.body.removeChild(ta); ok(); }
    });
    window.addEventListener('resize', fit); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    if (read()) chip();                                    // show the saved code at once, then check it with the server
    loadConfig().then(function (c) { sync(c); chip(); emit(); if (c.active && !c.existing) arm(); }).catch(function () { /* offline or server down: stay quiet */ });
    window.AirverWheel = { open: function () { opened = false; openWheel(); } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
