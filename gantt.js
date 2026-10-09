/* ============================================================
   gantt.js — Render Gantt chart (header bulan, bar, panah
   dependensi, penanda jalur kritis).
   ============================================================ */
(function (global) {
  'use strict';

  const S = global.Scheduler;

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const DOW = ['M', 'S', 'S', 'R', 'K', 'J', 'S']; // index Date.getDay(): 0=Minggu

  // konfigurasi tampilan
  const COL_W_DEFAULT = 34;   // lebar kolom hari (px)
  const ROW_H = 34;           // tinggi baris (px)
  const DAY_HEADER_H = 26;
  const MONTH_HEADER_H = 28;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function fmtDate(d) {
    return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  /**
   * render(state, schedule, opts)
   * state.tasks, state.calendar; schedule dari Scheduler.computeSchedule
   * opts: { colWidth, showCritical, onSelect(id), collapsed:Set, selectedId }
   */
  function render(state, schedule, opts) {
    opts = opts || {};
    const colW = opts.colWidth || COL_W_DEFAULT;
    const tasks = state.tasks;
    const cal = state.calendar;

    const leftRows = document.getElementById('ganttRows');
    const header = document.getElementById('ganttHeader');
    const scroll = document.getElementById('ganttScroll');
    const body = document.getElementById('ganttBody');
    const svg = document.getElementById('ganttSvg');
    const barsBox = document.getElementById('ganttBars');

    leftRows.innerHTML = '';
    header.innerHTML = '';
    barsBox.innerHTML = '';
    svg.innerHTML = '';

    if (!tasks.length) {
      leftRows.appendChild(el('div', 'gantt-empty', 'Belum ada tugas. Klik "Muat contoh" atau tambah tugas.'));
      return;
    }

    // ---------- rentang tanggal ----------
    let minD = null, maxD = null;
    schedule.byId.forEach(function (v) {
      if (!minD || v.start < minD) minD = v.start;
      if (!maxD || v.end > maxD) maxD = v.end;
    });
    if (!minD) { minD = new Date(); maxD = S.addDays(minD, 30); }
    const rangeStart = S.addDays(minD, -3);
    const rangeEnd = S.addDays(maxD, 7);
    const totalDays = Math.round((rangeEnd - rangeStart) / 86400000) + 1;
    const width = totalDays * colW;

    // ---------- daftar baris (flatten tugas + collapse) ----------
    const collapsed = opts.collapsed || new Set();
    const rows = []; // {task, depth}
    (function build(taskId, depth) {
      tasks.filter(function (t) { return t.parentId === taskId; }).forEach(function (t) {
        rows.push({ task: t, depth: depth });
        if (!collapsed.has(t.id)) build(t.id, depth + 1);
      });
    })(null, 0);
    // tugas yatim (parentId tidak ada) tetap tampil
    tasks.forEach(function (t) {
      if (t.parentId && !schedule.byId.has(t.parentId)) {
        if (!rows.some(function (r) { return r.task.id === t.id; })) {
          rows.push({ task: t, depth: 0 });
        }
      }
    });

    const height = Math.max(rows.length * ROW_H, 80);
    body.style.width = width + 'px';
    body.style.height = height + 'px';
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.style.width = width + 'px';
    svg.style.height = height + 'px';

    // ---------- header (bulan + hari) ----------
    const monthRow = el('div', 'gantt-month-row');
    monthRow.style.width = width + 'px';
    const dayRow = el('div', 'gantt-day-row');
    dayRow.style.width = width + 'px';

    let cur = new Date(rangeStart);
    while (cur <= rangeEnd) {
      const monthStart = new Date(cur.getFullYear(), cur.getMonth(), 1);
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
      const segStart = cur > rangeStart ? cur : rangeStart;
      const segEnd = monthEnd < rangeEnd ? monthEnd : rangeEnd;
      const segDays = Math.round((segEnd - segStart) / 86400000) + 1;
      const mcell = el('div', 'gantt-month', MONTHS[monthStart.getMonth()] + ' ' + monthStart.getFullYear());
      mcell.style.width = (segDays * colW) + 'px';
      monthRow.appendChild(mcell);
      cur = S.addDays(monthEnd, 1);
    }

    const todayStr = S.d2s(new Date());
    for (let i = 0; i < totalDays; i++) {
      const d = S.addDays(rangeStart, i);
      const cls = 'gantt-day' +
        (!S.isWorkday(cal, d) ? ' nonwork' : '') +
        (S.d2s(d) === todayStr ? ' today' : '');
      const cell = el('div', cls);
      cell.style.width = colW + 'px';
      const top = el('span', 'dow', DOW[d.getDay()]);
      const bot = el('span', 'dnum', String(d.getDate()));
      cell.appendChild(top);
      cell.appendChild(bot);
      dayRow.appendChild(cell);
    }
    header.appendChild(monthRow);
    header.appendChild(dayRow);
    header.style.width = width + 'px';

    // ---------- kolom non-kerja sebagai latar ----------
    const grid = el('div', 'gantt-grid');
    grid.style.width = width + 'px';
    grid.style.height = height + 'px';
    for (let i = 0; i < totalDays; i++) {
      const d = S.addDays(rangeStart, i);
      if (!S.isWorkday(cal, d)) {
        const c = el('div', 'gantt-nonwork-col');
        c.style.left = (i * colW) + 'px';
        c.style.width = colW + 'px';
        c.style.height = height + 'px';
        grid.appendChild(c);
      }
    }
    body.appendChild(grid);

    // ---------- bar + label kiri ----------
    const barPos = new Map(); // id -> {x1,x2,y}
    rows.forEach(function (row, i) {
      const t = row.task;
      const v = schedule.byId.get(t.id);
      const y = i * ROW_H;

      // label kiri
      const lrow = el('div', 'gantt-row' + (opts.selectedId === t.id ? ' selected' : ''));
      lrow.style.height = ROW_H + 'px';
      lrow.dataset.id = t.id;
      const indent = el('span', 'indent');
      indent.style.width = (row.depth * 16) + 'px';
      lrow.appendChild(indent);
      if (t.deps && t.deps.length) {
        const badge = el('span', 'dep-badge', '⛓');
        badge.title = t.deps.length + ' dependensi';
        lrow.appendChild(badge);
      }
      const nameSpan = el('span', 'gantt-task-name', (t.code ? t.code + ' · ' : '') + t.name);
      lrow.appendChild(nameSpan);
      const dur = el('span', 'gantt-dur', (v ? v.duration : t.duration) + ' hr');
      lrow.appendChild(dur);
      const prog = el('span', 'gantt-prog', Math.round(t.progress) + '%');
      lrow.appendChild(prog);
      lrow.addEventListener('click', function () {
        if (opts.onSelect) opts.onSelect(t.id);
      });
      leftRows.appendChild(lrow);

      if (!v) return;

      // bar
      const x1 = Math.round((v.start - rangeStart) / 86400000) * colW;
      const x2 = Math.round((v.end - rangeStart) / 86400000) * colW + colW;
      const bar = el('div', 'gantt-bar' +
        (opts.showCritical && schedule.critical.has(t.id) ? ' critical' : '') +
        (t.parentId ? '' : ' root'));
      bar.style.left = x1 + 'px';
      bar.style.top = (y + 5) + 'px';
      bar.style.width = Math.max(colW - 4, x2 - x1 - 4) + 'px';
      bar.style.height = (ROW_H - 10) + 'px';
      bar.style.background = t.color || '#4f8ef7';
      bar.title = t.name + ' — ' + fmtDate(v.start) + ' → ' + fmtDate(v.end) +
        ' (' + v.duration + ' hari kerja)';
      const fill = el('div', 'gantt-bar-progress');
      fill.style.width = Math.min(100, Math.max(0, t.progress)) + '%';
      bar.appendChild(fill);
      const lbl = el('span', 'bar-label', t.name);
      bar.appendChild(lbl);
      bar.addEventListener('click', function (e) {
        e.stopPropagation();
        if (opts.onSelect) opts.onSelect(t.id);
      });
      barsBox.appendChild(bar);

      barPos.set(t.id, { x1: x1 + colW - 4, x2: x1, yMid: y + ROW_H / 2, xL: x1, xR: x2 - 4 });
    });

    // ---------- panah dependensi ----------
    const NS = 'http://www.w3.org/2000/svg';
    function arrow(x1, y1, x2, y2, criticalArrow) {
      const midX = x1 + Math.max(8, (x2 - x1) / 2);
      let d;
      if (x2 - x1 >= 12) {
        d = 'M' + x1 + ',' + y1 + ' H' + midX + ' V' + y2 + ' H' + (x2 - 6);
      } else {
        // mundur: lalu-kanan-atas-bawah
        const backX = x1 + 10;
        const lane = y2 > y1 ? y2 - 8 : y2 + 8;
        d = 'M' + x1 + ',' + y1 + ' H' + backX + ' V' + lane + ' H' + (x2 - 6);
      }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'dep-line' + (criticalArrow ? ' crit' : ''));
      svg.appendChild(p);
      const head = document.createElementNS(NS, 'polygon');
      head.setAttribute('points', (x2 - 6) + ',' + (y2 - 4) + ' ' + x2 + ',' + y2 + ' ' + (x2 - 6) + ',' + (y2 + 4));
      head.setAttribute('class', 'dep-head' + (criticalArrow ? ' crit' : ''));
      svg.appendChild(head);
    }

    tasks.forEach(function (t) {
      const a = barPos.get(t.id);
      if (!a) return;
      (t.deps || []).forEach(function (dep) {
        const b = barPos.get(dep.predId);
        if (!b) return;
        const type = dep.type || 'FS';
        let x1, x2;
        if (type === 'FS' || type === 'FF') { x1 = b.xR; } else { x1 = b.xL; }
        if (type === 'FS' || type === 'SS') { x2 = a.xL; } else { x2 = a.xR; }
        const critArrow = opts.showCritical &&
          schedule.critical.has(t.id) && schedule.critical.has(dep.predId);
        // y1 = sisi kanan/kiri pred, y2 = sisi kiri successor
        const y1 = b.yMid, y2 = a.yMid;
        if (type === 'FF') {
          arrow(b.xR, y1, a.xR, y2, critArrow);
        } else if (type === 'SS') {
          arrow(b.xL, y1, a.xL, y2, critArrow);
        } else if (type === 'SF') {
          arrow(b.xR, y1, a.xL, y2, critArrow);
        } else {
          arrow(b.xR, y1, a.xL, y2, critArrow);
        }
      });
    });

    // ---------- garis hari ini ----------
    const todayIdx = Math.round((new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - rangeStart) / 86400000);
    if (todayIdx >= 0 && todayIdx < totalDays) {
      const line = document.createElementNS(NS, 'line');
      line.setAttribute('x1', todayIdx * colW + colW / 2);
      line.setAttribute('x2', todayIdx * colW + colW / 2);
      line.setAttribute('y1', 0);
      line.setAttribute('y2', height);
      line.setAttribute('class', 'today-line');
      svg.appendChild(line);
    }

    // sinkronkan scroll horizontal ke header
    scroll.onscroll = function () {
      header.style.transform = 'translateX(' + (-scroll.scrollLeft) + 'px)';
    };
  }

  global.Gantt = { render: render, fmtDate: fmtDate, ROW_H: ROW_H };
})(window);
