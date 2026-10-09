/* ============================================================
   scheduler.js — Logika penjadwalan proyek (hari kerja,
   subtugas, dependensi FS/SS/FF/SF + delay, jalur kritis).
   Murni JS, tanpa dependensi. Dipakai browser (window.Scheduler)
   dan Node untuk pengujian (module.exports).
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------- Util tanggal (timezone-lokal aman) ---------- */
  const DAY_MS = 86400000;

  function d2s(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
  }

  function s2d(s) {
    const p = String(s).split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }

  function addDays(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  /* ---------- Hari kerja ---------- */
  // cal = { sat: 'off'|'work', sun: 'off'|'work',
  //         holidays: [{date:'YYYY-MM-DD', name:'', recurring:false}] }
  function isWeekend(cal, d) {
    const wd = d.getDay(); // 0=Min .. 6=Sab
    if (wd === 6 && cal.sat === 'off') return true;
    if (wd === 0 && cal.sun === 'off') return true;
    return false;
  }

  function isHoliday(cal, d) {
    const ds = d2s(d);
    const md = ds.slice(5); // bulan-tahun untuk recurring
    const holi = cal.holidays || [];
    for (let i = 0; i < holi.length; i++) {
      const h = holi[i];
      if (h.recurring) {
        if (h.date.slice(5) === md) return true;
      } else if (h.date === ds) {
        return true;
      }
    }
    return false;
  }

  function isWorkday(cal, d) {
    return !isWeekend(cal, d) && !isHoliday(cal, d);
  }

  function nextWorkday(cal, d) {
    let x = d;
    let guard = 0;
    while (!isWorkday(cal, x) && guard++ < 3650) x = addDays(x, 1);
    return x;
  }

  function prevWorkday(cal, d) {
    let x = d;
    let guard = 0;
    while (!isWorkday(cal, x) && guard++ < 3650) x = addDays(x, -1);
    return x;
  }

  /** Tambah n hari kerja dari tanggal asal (asal diasumsikan hari kerja). */
  function addWorkdays(cal, d, n) {
    let x = d;
    let c = 0;
    if (n >= 0) {
      while (c < n) {
        x = addDays(x, 1);
        if (isWorkday(cal, x)) c++;
      }
    } else {
      while (c > n) {
        x = addDays(x, -1);
        if (isWorkday(cal, x)) c--;
      }
    }
    return x;
  }

  /** Hitung jumlah hari kerja inklusif antara dua tanggal (a<=b). */
  function workdaysBetween(cal, a, b) {
    let n = 0;
    let x = a;
    while (x <= b) {
      if (isWorkday(cal, x)) n++;
      x = addDays(x, 1);
    }
    return n;
  }

  /* ---------- Id unik ---------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 9) +
      Date.now().toString(36).slice(-4);
  }

  /* ---------- Validasi struktur tugas ---------- */
  function indexTasks(tasks) {
    const byId = new Map();
    tasks.forEach(function (t) { byId.set(t.id, t); });
    const childrenOf = new Map();
    tasks.forEach(function (t) {
      if (t.parentId && byId.has(t.parentId)) {
        if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
        childrenOf.get(t.parentId).push(t);
      }
    });
    return { byId: byId, childrenOf: childrenOf };
  }

  /** Apakah `maybeAncestor` adalah leluhur (langsung/tidak) dari `id`? */
  function isAncestor(tasks, byId, maybeAncestor, id) {
    let cur = byId.get(id);
    let guard = 0;
    while (cur && cur.parentId && guard++ < 10000) {
      if (cur.parentId === maybeAncestor) return true;
      cur = byId.get(cur.parentId);
    }
    return false;
  }

  /** Urutan topologi sederhana berdasarkan dependensi (cycle diabaikan). */
  function topoSort(tasks, byId) {
    const indeg = new Map();
    const adj = new Map();
    tasks.forEach(function (t) {
      indeg.set(t.id, 0);
      adj.set(t.id, []);
    });
    tasks.forEach(function (t) {
      (t.deps || []).forEach(function (dep) {
        if (!byId.has(dep.predId) || dep.predId === t.id) return;
        // abaikan dependensi ke turunan sendiri (mencegah siklus hierarki)
        if (isAncestor(tasks, byId, t.id, dep.predId)) return;
        adj.get(dep.predId).push(t.id);
        indeg.set(t.id, indeg.get(t.id) + 1);
      });
    });
    const queue = [];
    indeg.forEach(function (v, k) { if (v === 0) queue.push(k); });
    const order = [];
    while (queue.length) {
      const n = queue.shift();
      order.push(n);
      adj.get(n).forEach(function (m) {
        indeg.set(m, indeg.get(m) - 1);
        if (indeg.get(m) === 0) queue.push(m);
      });
    }
    // sisa yang tidak masuk (cycle) → tambahkan apa adanya
    tasks.forEach(function (t) { if (order.indexOf(t.id) === -1) order.push(t.id); });
    return order;
  }

  /* ============================================================
     computeSchedule(project, calendar, tasks)
     Mengembalikan:
       { byId: Map(id -> {start:Date, end:Date, startIdx, endIdx, duration}),
         critical: Set(id), projectStart:Date, projectEnd:Date,
         criticalPath: [id...] (urut), totalWorkdays: n, warnings: [str] }
     startIdx/endIdx = indeks hari kerja sejak epoch (untuk perhitungan).
     ============================================================ */

  // epoch = 2000-01-03 (Senin) agar indeks tidak negatif
  const EPOCH = new Date(2000, 0, 3);

  function workdayIndex(cal, d) {
    // jumlah hari kerja dari EPOCH (inklusif terhadap d bila hari kerja)
    let n = 0;
    let x = EPOCH;
    let guard = 0;
    if (d < EPOCH) return 0;
    while (x <= d && guard++ < 100000) {
      if (isWorkday(cal, x)) n++;
      x = addDays(x, 1);
    }
    return n - (isWorkday(cal, d) ? 1 : 0); // indeks hari kerja d (0-based)
  }

  function dateFromWorkdayIndex(cal, idx) {
    let n = 0;
    let x = EPOCH;
    let guard = 0;
    while (guard++ < 100000) {
      if (isWorkday(cal, x)) {
        if (n === idx) return x;
        n++;
      }
      x = addDays(x, 1);
    }
    return x;
  }

  function computeSchedule(project, cal, tasks) {
    const warnings = [];
    const byId = new Map();
    tasks.forEach(function (t) { byId.set(t.id, t); });

    // praproses: durasi minimal 1, progress clamp
    tasks.forEach(function (t) {
      t.duration = Math.max(1, parseInt(t.duration, 10) || 1);
      t.progress = Math.min(100, Math.max(0, parseFloat(t.progress) || 0));
    });

    const childrenOf = new Map();
    tasks.forEach(function (t) {
      if (t.parentId && byId.has(t.parentId)) {
        if (!childrenOf.has(t.parentId)) childrenOf.set(t.parentId, []);
        childrenOf.get(t.parentId).push(t);
      } else if (t.parentId && !byId.has(t.parentId)) {
        t.parentId = null; // induk hilang → jadikan tugas utama
      }
    });

    const order = topoSort(tasks, byId);
    const sched = new Map(); // id -> {startIdx, endIdx}
    // offset geser subpohon (dipakai saat dependensi pada induk menggeser anak)
    const offsets = new Map(); // leafId -> +hari kerja

    function pushSubtree(parentId, delta) {
      if (!delta) return;
      (function walk(pid) {
        const kids = childrenOf.get(pid) || [];
        if (!kids.length) {
          offsets.set(pid, (offsets.get(pid) || 0) + delta);
          return;
        }
        kids.forEach(function (k) { walk(k.id); });
      })(parentId);
    }

    function constraintFrom(dep, predSched) {
      // hasilkan {minStartIdx} dan/atau {minEndIdx} sesuai tipe
      const lag = Math.max(0, parseInt(dep.lag, 10) || 0);
      const type = dep.type || 'FS';
      if (type === 'FS') {
        return { minStartIdx: predSched.endIdx + 1 + lag };
      }
      if (type === 'SS') {
        return { minStartIdx: predSched.startIdx + lag };
      }
      if (type === 'FF') {
        return { minEndIdx: predSched.endIdx + lag };
      }
      // SF
      return { minStartIdx: predSched.endIdx + lag };
    }

    // Iterasi agar konstrain induk-anak dan dependensi konvergen
    for (let pass = 0; pass < Math.max(4, tasks.length); pass++) {
      let changed = false;
      order.forEach(function (id) {
        const t = byId.get(id);
        const kids = childrenOf.get(id) || [];
        let startIdx, endIdx;

        if (kids.length > 0) {
          // induk: ikut anak-anaknya
          let minS = Infinity, maxE = -Infinity;
          kids.forEach(function (k) {
            const ks = sched.get(k.id);
            if (ks) {
              if (ks.startIdx < minS) minS = ks.startIdx;
              if (ks.endIdx > maxE) maxE = ks.endIdx;
            }
          });
          if (minS === Infinity) {
            minS = workdayIndex(cal, nextWorkday(cal, s2d(project.startDate || d2s(new Date()))));
            maxE = minS + t.duration - 1;
          }
          startIdx = minS;
          endIdx = Math.max(maxE, startIdx);

          // dependensi pada induk: geser seluruh subpohon agar konstrain terpenuhi
          (t.deps || []).forEach(function (dep) {
            const ps = sched.get(dep.predId);
            if (!ps) return;
            if (isAncestor(tasks, byId, id, dep.predId)) return;
            const c = constraintFrom(dep, ps);
            if (c.minStartIdx !== undefined && c.minStartIdx > startIdx) {
              pushSubtree(id, c.minStartIdx - startIdx);
              changed = true;
            }
            if (c.minEndIdx !== undefined && c.minEndIdx > endIdx) {
              pushSubtree(id, c.minEndIdx - endIdx);
              changed = true;
            }
          });
        } else {
          // daun: anchor tanggal mulai + offset geser subpohon
          const base = t.start ? s2d(t.start) : s2d(project.startDate || d2s(new Date()));
          startIdx = workdayIndex(cal, nextWorkday(cal, base)) + (offsets.get(id) || 0);
          endIdx = startIdx + t.duration - 1;

          // terapkan dependensi (semua diterjemahkan ke batas minimum startIdx)
          (t.deps || []).forEach(function (dep) {
            const ps = sched.get(dep.predId);
            if (!ps) return;
            if (isAncestor(tasks, byId, id, dep.predId)) return; // skip siklus hierarki
            const c = constraintFrom(dep, ps);
            if (c.minStartIdx !== undefined && c.minStartIdx > startIdx) {
              startIdx = c.minStartIdx;
            }
            if (c.minEndIdx !== undefined) {
              // FF: durasi tetap, geser start agar finish tercapai
              const need = c.minEndIdx - (t.duration - 1);
              if (need > startIdx) startIdx = need;
            }
          });
          endIdx = startIdx + t.duration - 1;
        }

        if (endIdx < startIdx) endIdx = startIdx;

        const prev = sched.get(id);
        if (!prev || prev.startIdx !== startIdx || prev.endIdx !== endIdx) {
          sched.set(id, { startIdx: startIdx, endIdx: endIdx });
          changed = true;
        }
      });
      if (!changed) break;
    }

    // Susun hasil tanggal
    const result = new Map();
    sched.forEach(function (v, id) {
      const t = byId.get(id);
      const start = dateFromWorkdayIndex(cal, v.startIdx);
      const end = dateFromWorkdayIndex(cal, v.endIdx);
      result.set(id, {
        start: start,
        end: end,
        startIdx: v.startIdx,
        endIdx: v.endIdx,
        duration: workdaysBetween(cal, start, end)
      });
    });

    /* ---------- Jalur kritis (CPM sederhana) ---------- */
    // forward: ES/EF sudah dari schedule; backward: LS/LF
    let projEndIdx = -Infinity, projStartIdx = Infinity;
    result.forEach(function (v) {
      if (v.endIdx > projEndIdx) projEndIdx = v.endIdx;
      if (v.startIdx < projStartIdx) projStartIdx = v.startIdx;
    });
    if (!isFinite(projEndIdx)) { projEndIdx = 0; projStartIdx = 0; }

    const lf = new Map(); // latest finish idx
    const succ = new Map();
    tasks.forEach(function (t) { succ.set(t.id, []); });
    tasks.forEach(function (t) {
      (t.deps || []).forEach(function (dep) {
        if (!byId.has(dep.predId)) return;
        if (isAncestor(tasks, byId, t.id, dep.predId)) return;
        succ.get(dep.predId).push({ id: t.id, type: dep.type || 'FS', lag: Math.max(0, parseInt(dep.lag, 10) || 0) });
      });
    });

    const revOrder = order.slice().reverse();
    // init LF = EF
    result.forEach(function (v, id) { lf.set(id, v.endIdx); });
    for (let pass = 0; pass < Math.max(4, tasks.length); pass++) {
      let changed = false;
      revOrder.forEach(function (id) {
        const s = result.get(id);
        const t = byId.get(id);
        let newLf = succ.get(id).length ? Infinity : projEndIdx;
        succ.get(id).forEach(function (sc) {
          const sls = lf.get(sc.id) - (result.get(sc.id).duration - 1);
          let allowed;
          if (sc.type === 'FS') allowed = sls - 1 - sc.lag;
          else if (sc.type === 'SS') allowed = sls - sc.lag + (s.duration - 1);
          else if (sc.type === 'FF') allowed = lf.get(sc.id) - sc.lag;
          else allowed = sls - sc.lag; // SF
          if (allowed < newLf) newLf = allowed;
        });
        if (newLf === Infinity) newLf = s.endIdx;
        // induk: LF tidak boleh melebihi LF anak? (anak mengikuti induk via agregasi)
        const kids = childrenOf.get(id) || [];
        if (kids.length) {
          kids.forEach(function (k) {
            const ks = result.get(k.id);
            if (ks && ks.endIdx >= s.endIdx) {
              // anak penentu akhir → LF anak = LF induk
              if (lf.get(k.id) > newLf) { lf.set(k.id, newLf); changed = true; }
            }
          });
        }
        if (newLf < s.endIdx) newLf = s.endIdx; // jangan lebih awal dari EF
        if (lf.get(id) !== newLf) { lf.set(id, newLf); changed = true; }
      });
      if (!changed) break;
    }

    const critical = new Set();
    result.forEach(function (v, id) {
      const ls = lf.get(id) - (v.duration - 1);
      if (ls - v.startIdx <= 0) critical.add(id);
    });

    // jalur kritis berurutan (dari predecessor kritis)
    const hasCritPred = new Set();
    tasks.forEach(function (t) {
      (t.deps || []).forEach(function (dep) {
        if (critical.has(dep.predId) && critical.has(t.id)) hasCritPred.add(t.id);
      });
    });
    const roots = [];
    result.forEach(function (v, id) { if (!hasCritPred.has(id) && critical.has(id)) roots.push(id); });
    // urutkan roots berdasarkan startIdx
    roots.sort(function (a, b) { return result.get(a).startIdx - result.get(b).startIdx; });
    const criticalPath = [];
    roots.forEach(function (r) {
      (function walk(id) {
        if (criticalPath.indexOf(id) !== -1) return;
        const wt = byId.get(id);
        if (!wt.parentId) criticalPath.push(id); // jalur kritis setingkat tugas induk
        tasks.forEach(function (t) {
          (t.deps || []).forEach(function (dep) {
            if (dep.predId === id && critical.has(t.id)) walk(t.id);
          });
        });
      })(r);
    });

    // total hari kerja proyek (dari mulai proyek hingga selesai)
    const totalWorkdays = projEndIdx >= projStartIdx ? (projEndIdx - projStartIdx + 1) : 0;

    // cek cycle dependensi → peringatan
    if (order.length !== tasks.length) {
      warnings.push('Ditemukan dependensi melingkar; sebagian diabaikan.');
    }

    return {
      byId: result,
      critical: critical,
      criticalPath: criticalPath,
      projectStart: dateFromWorkdayIndex(cal, projStartIdx),
      projectEnd: dateFromWorkdayIndex(cal, projEndIdx),
      totalWorkdays: totalWorkdays,
      warnings: warnings
    };
  }

  /* ============================================================
     Data contoh: Sasa Store
     ============================================================ */
  function sampleData() {
    const T = function (code, name, dur, start, prio, color, progress, deps, parent) {
      return {
        id: 'task_' + code.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + Math.random().toString(36).slice(2, 6),
        code: code, name: name, duration: dur, start: start,
        priority: prio, color: color, progress: progress || 0,
        deps: deps || [], parentId: parent || null
      };
    };

    const A = T('A', 'Riset Kebutuhan & Data Produk', 3, '2026-10-12', 'high', '#4f8ef7', 0, []);
    const a1 = T('A1', 'Survei Pelanggan', 2, '2026-10-12', 'medium', '#7fb0f9', 0, [], A.id);
    const a2 = T('A2', 'Analisis Kompetitor', 2, '2026-10-12', 'medium', '#7fb0f9', 0, [], A.id);
    const a3 = T('A3', 'Pendataan Produk & Komposisi', 3, '2026-10-12', 'medium', '#7fb0f9', 0, [], A.id);

    const B = T('B', 'Desain UI/UX', 5, null, 'high', '#e8590c', 0,
      [{ predId: A.id, type: 'FS', lag: 0 }]);
    const C = T('C', 'Setup Database & Server', 3, null, 'medium', '#0c8599', 0,
      [{ predId: A.id, type: 'FS', lag: 0 }]);
    const D = T('D', 'Katalog Produk & Filter Jenis Kulit', 7, null, 'high', '#2f9e44', 0,
      [{ predId: B.id, type: 'FS', lag: 0 }, { predId: C.id, type: 'FS', lag: 0 }]);
    const E = T('E', 'Keranjang & Checkout', 6, null, 'high', '#9c36b5', 0,
      [{ predId: D.id, type: 'FS', lag: 0 }]);
    const F = T('F', 'Integrasi Pembayaran & Ongkir', 5, null, 'high', '#e8590c', 0,
      [{ predId: C.id, type: 'FS', lag: 0 }]);
    const G = T('G', 'Panel Admin Produk, Stok & Pesanan', 6, null, 'medium', '#1971c2', 0,
      [{ predId: C.id, type: 'SS', lag: 2 }]);
    const H = T('H', 'Kuis Rekomendasi Jenis Kulit', 4, null, 'low', '#f08c00', 0,
      [{ predId: D.id, type: 'FS', lag: 0 }]);
    const I = T('I', 'Pengujian', 4, null, 'high', '#c92a2a', 0,
      [{ predId: E.id, type: 'FS', lag: 0 }, { predId: F.id, type: 'FS', lag: 0 },
       { predId: G.id, type: 'FS', lag: 0 }, { predId: H.id, type: 'FS', lag: 0 }]);
    const J = T('J', 'Peluncuran & Promosi', 2, null, 'high', '#2b8a3e', 0,
      [{ predId: I.id, type: 'FS', lag: 0 }]);

    return {
      project: {
        name: 'Pembangunan Website Toko Online Sasa Store',
        org: 'PT Kosmetika Gorontalo',
        website: 'https://sasastore.example.id',
        desc: 'Pembangunan e-commerce untuk produk kosmetik & skincare, termasuk katalog, checkout, pembayaran, panel admin, dan kuis rekomendasi jenis kulit.',
        startDate: '2026-10-12'
      },
      calendar: {
        sat: 'off',
        sun: 'off',
        holidays: [
          { id: uid('h'), date: '2026-10-28', name: 'Hari Libur Nasional (contoh)', recurring: false }
        ]
      },
      tasks: [A, a1, a2, a3, B, C, D, E, F, G, H, I, J]
    };
  }

  const api = {
    d2s: d2s, s2d: s2d, addDays: addDays,
    isWeekend: isWeekend, isHoliday: isHoliday, isWorkday: isWorkday,
    nextWorkday: nextWorkday, prevWorkday: prevWorkday,
    addWorkdays: addWorkdays, workdaysBetween: workdaysBetween,
    uid: uid, computeSchedule: computeSchedule, sampleData: sampleData,
    isAncestor: isAncestor
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.Scheduler = api;
})(typeof window !== 'undefined' ? window : globalThis);
