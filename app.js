/* ============================================================
   app.js — UI utama: state, localStorage, form proyek,
   kalender kerja, daftar tugas + subtugas, dependensi,
   resource tim, export/import JSON, tombol contoh.
   ============================================================ */
(function () {
  'use strict';

  const S = window.Scheduler;
  const STORAGE_KEY = 'ganttlite.v1';

  /* ---------- State ---------- */
  function blankState() {
    const today = S.d2s(new Date());
    return {
      project: { name: '', org: '', website: '', desc: '', startDate: today },
      calendar: { sat: 'off', sun: 'off', holidays: [] },
      tasks: []
    };
  }

  let state = loadState();
  let schedule = null;
  let selectedId = null;
  let editingId = null;      // null = editor tertutup
  let draftDeps = [];        // dependensi saat mengedit (draft)
  let ui = {
    colWidth: 34,
    showCritical: false,
    collapsed: new Set()
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      const st = JSON.parse(raw);
      return normalizeState(st);
    } catch (e) {
      console.warn('Gagal memuat data:', e);
      return blankState();
    }
  }

  function normalizeState(st) {
    const base = blankState();
    st = st || {};
    st.project = Object.assign(base.project, st.project || {});
    st.calendar = Object.assign({ sat: 'off', sun: 'off', holidays: [] }, st.calendar || {});
    if (!Array.isArray(st.calendar.holidays)) st.calendar.holidays = [];
    st.tasks = Array.isArray(st.tasks) ? st.tasks : [];
    st.tasks.forEach(function (t) {
      t.id = t.id || S.uid('task');
      t.code = t.code || '';
      t.name = t.name || '(tanpa nama)';
      t.duration = Math.max(1, parseInt(t.duration, 10) || 1);
      t.progress = Math.min(100, Math.max(0, parseFloat(t.progress) || 0));
      t.priority = t.priority || 'medium';
      t.color = t.color || '#4f8ef7';
      t.resource = t.resource || '';
      t.deps = Array.isArray(t.deps) ? t.deps : [];
      if (t.start === undefined) t.start = null;
    });
    return st;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      toast('Gagal menyimpan ke localStorage: ' + e.message, true);
    }
  }

  /* ---------- Toast ---------- */
  let toastTimer = null;
  function toast(msg, isError) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast hidden'; }, 3200);
  }

  /* ---------- Recompute + render ---------- */
  function recompute() {
    schedule = S.computeSchedule(state.project, state.calendar, state.tasks);
    renderProject();
    renderCalendar();
    renderTaskTree();
    renderGantt();
    renderStats();
    save();
  }

  function renderGantt() {
    window.Gantt.render(state, schedule, {
      colWidth: ui.colWidth,
      showCritical: ui.showCritical,
      collapsed: ui.collapsed,
      selectedId: selectedId,
      onSelect: function (id) {
        selectedId = id;
        openEditor(id);
        renderTaskTree();
        renderGantt();
        document.getElementById('panelTask').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }

  function renderStats() {
    const line = document.getElementById('statsLine');
    const n = state.tasks.length;
    if (!n) { line.textContent = ''; return; }
    let txt = n + ' tugas · ' + schedule.totalWorkdays + ' hari kerja · ' +
      'mulai ' + window.Gantt.fmtDate(schedule.projectStart) + ' · ' +
      'selesai ' + window.Gantt.fmtDate(schedule.projectEnd);
    if (ui.showCritical) {
      const cp = schedule.criticalPath
        .map(function (id) { const t = findTask(id); return t ? (t.code || t.name) : '?'; })
        .join(' → ');
      txt += ' · Jalur kritis: ' + (cp || '-');
    }
    line.textContent = txt;
  }

  function findTask(id) {
    for (let i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /* ---------- Panel proyek ---------- */
  const projectForm = document.getElementById('projectForm');
  function syncProjectForm() {
    const p = state.project;
    projectForm.name.value = p.name || '';
    projectForm.org.value = p.org || '';
    projectForm.website.value = p.website || '';
    projectForm.desc.value = p.desc || '';
    projectForm.startDate.value = p.startDate || '';
  }
  function renderProject() {
    document.getElementById('projectTitle').textContent =
      state.project.name || 'Belum ada proyek';
  }
  projectForm.addEventListener('input', function () {
    state.project.name = projectForm.name.value.trim();
    state.project.org = projectForm.org.value.trim();
    state.project.website = projectForm.website.value.trim();
    state.project.desc = projectForm.desc.value.trim();
    state.project.startDate = projectForm.startDate.value || S.d2s(new Date());
    recompute();
  });

  /* ---------- Kalender ---------- */
  const satMode = document.getElementById('satMode');
  const sunMode = document.getElementById('sunMode');
  satMode.addEventListener('change', function () {
    state.calendar.sat = satMode.value; recompute();
  });
  sunMode.addEventListener('change', function () {
    state.calendar.sun = sunMode.value; recompute();
  });
  function renderCalendar() {
    satMode.value = state.calendar.sat;
    sunMode.value = state.calendar.sun;
    document.getElementById('chip6').classList.toggle('work', state.calendar.sat === 'work');
    document.getElementById('chip0').classList.toggle('work', state.calendar.sun === 'work');

    const list = document.getElementById('holidayList');
    list.innerHTML = '';
    const holi = state.calendar.holidays.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : 1;
    });
    if (!holi.length) {
      const li = document.createElement('li');
      li.className = 'hint';
      li.textContent = 'Belum ada hari libur custom.';
      list.appendChild(li);
      return;
    }
    holi.forEach(function (h) {
      const li = document.createElement('li');
      const d = S.s2d(h.date);
      const dateTxt = window.Gantt.fmtDate(d);
      li.innerHTML = '<span class="holi-name"></span>' +
        '<span class="holi-date"></span>' +
        (h.recurring ? '<span class="holi-badge">tiap tahun</span>' : '') +
        '<button class="mini-btn danger" type="button" title="Hapus">✕</button>';
      li.querySelector('.holi-name').textContent = h.name || '(libur)';
      li.querySelector('.holi-date').textContent = dateTxt;
      li.querySelector('button').addEventListener('click', function () {
        state.calendar.holidays = state.calendar.holidays.filter(function (x) { return x.id !== h.id; });
        recompute();
        toast('Hari libur dihapus.');
      });
      list.appendChild(li);
    });
  }
  document.getElementById('holidayForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const f = e.target;
    if (!f.date.value || !f.name.value.trim()) return;
    state.calendar.holidays.push({
      id: S.uid('h'),
      date: f.date.value,
      name: f.name.value.trim(),
      recurring: f.recurrence.value === 'yearly'
    });
    f.reset();
    recompute();
    toast('Hari libur ditambahkan.');
  });

  /* ---------- Daftar tugas (pohon) ---------- */
  function renderTaskTree() {
    const box = document.getElementById('taskTree');
    box.innerHTML = '';
    document.getElementById('btnAddSubtask').disabled = !selectedId;
    if (!state.tasks.length) {
      box.innerHTML = '<p class="hint">Belum ada tugas. Tambah tugas utama atau muat contoh.</p>';
      return;
    }
    (function walk(parentId, depth) {
      state.tasks.filter(function (t) { return (t.parentId || null) === parentId; })
        .forEach(function (t) {
          const row = document.createElement('div');
          row.className = 'task-item' + (selectedId === t.id ? ' selected' : '');
          row.style.paddingLeft = (8 + depth * 16) + 'px';

          const caret = document.createElement('span');
          const kids = state.tasks.filter(function (x) { return x.parentId === t.id; });
          if (kids.length) {
            caret.className = 'tree-caret' + (ui.collapsed.has(t.id) ? ' collapsed' : '');
            caret.textContent = ui.collapsed.has(t.id) ? '▸' : '▾';
            caret.title = 'Buka/tutup subtugas';
            caret.addEventListener('click', function (e) {
              e.stopPropagation();
              if (ui.collapsed.has(t.id)) ui.collapsed.delete(t.id);
              else ui.collapsed.add(t.id);
              renderTaskTree(); renderGantt();
            });
          } else {
            caret.className = 'tree-caret empty';
            caret.textContent = '•';
          }
          row.appendChild(caret);

          const dot = document.createElement('span');
          dot.className = 'color-dot';
          dot.style.background = t.color;
          row.appendChild(dot);

          const name = document.createElement('span');
          name.className = 'task-item-name';
          name.textContent = (t.code ? t.code + '. ' : '') + t.name;
          row.appendChild(name);

          const meta = document.createElement('span');
          meta.className = 'task-item-meta';
          const v = schedule.byId.get(t.id);
          meta.textContent = (v ? v.duration : t.duration) + ' hr · ' + Math.round(t.progress) + '%' +
            (t.resource ? ' · ' + t.resource : '');
          row.appendChild(meta);

          const prio = document.createElement('span');
          prio.className = 'prio-badge prio-' + t.priority;
          prio.textContent = t.priority === 'high' ? 'Tinggi' : t.priority === 'low' ? 'Rendah' : 'Sedang';
          row.appendChild(prio);

          const actions = document.createElement('span');
          actions.className = 'task-actions';
          const btnSub = document.createElement('button');
          btnSub.type = 'button';
          btnSub.className = 'mini-btn';
          btnSub.textContent = '+sub';
          btnSub.title = 'Tambah subtugas';
          btnSub.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditor(null, t.id);
          });
          const btnEdit = document.createElement('button');
          btnEdit.type = 'button';
          btnEdit.className = 'mini-btn';
          btnEdit.textContent = 'Edit';
          btnEdit.addEventListener('click', function (e) {
            e.stopPropagation();
            openEditor(t.id);
          });
          const btnDel = document.createElement('button');
          btnDel.type = 'button';
          btnDel.className = 'mini-btn danger';
          btnDel.textContent = '✕';
          btnDel.title = 'Hapus tugas (termasuk subtugas)';
          btnDel.addEventListener('click', function (e) {
            e.stopPropagation();
            deleteTask(t.id);
          });
          actions.appendChild(btnSub);
          actions.appendChild(btnEdit);
          actions.appendChild(btnDel);
          row.appendChild(actions);

          row.addEventListener('click', function () {
            selectedId = t.id;
            renderTaskTree(); renderGantt();
          });
          box.appendChild(row);

          if (!ui.collapsed.has(t.id)) walk(t.id, depth + 1);
        });
    })(null, 0);
  }

  /* ---------- Editor tugas ---------- */
  const taskForm = document.getElementById('taskForm');
  const editorBox = document.getElementById('taskEditor');
  const depList = document.getElementById('depList');
  const depPred = document.getElementById('depPred');

  function openEditor(id, parentId) {
    editingId = id || null;
    const t = id ? findTask(id) : null;
    document.getElementById('taskEditorTitle').textContent =
      t ? 'Edit tugas' : (parentId ? 'Subtugas baru' : 'Tugas baru');
    taskForm.id.value = t ? t.id : '';
    taskForm.name.value = t ? t.name : '';
    taskForm.code.value = t ? t.code : '';
    taskForm.priority.value = t ? t.priority : 'medium';
    taskForm.start.value = t && t.start ? t.start : (state.project.startDate || S.d2s(new Date()));
    taskForm.duration.value = t ? t.duration : 1;
    taskForm.progress.value = t ? Math.round(t.progress) : 0;
    taskForm.color.value = t ? t.color : '#4f8ef7';
    taskForm.resource.value = t ? (t.resource || '') : '';
    draftDeps = t ? JSON.parse(JSON.stringify(t.deps || [])) : [];
    editorBox.dataset.parentId = parentId || (t ? t.parentId : '') || '';
    editorBox.classList.remove('hidden');
    renderDepEditor();
    refreshPredOptions();
    // tugas induk: durasi & tanggal mulai otomatis
    const isParent = t ? state.tasks.some(function (x) { return x.parentId === t.id; }) : false;
    toggleParentAuto(isParent);
    document.getElementById('btnDeleteTask').style.display = t ? '' : 'none';
    taskForm.name.focus();
  }

  function toggleParentAuto(isParent) {
    document.getElementById('dateDurationFields').classList.toggle('disabled-fields', isParent);
    document.querySelector('.auto-date-hint').classList.toggle('hidden', !isParent);
    taskForm.start.disabled = isParent;
    taskForm.duration.disabled = isParent;
  }

  function closeEditor() {
    editingId = null;
    editorBox.classList.add('hidden');
  }
  document.getElementById('btnCancelTask').addEventListener('click', closeEditor);

  function refreshPredOptions() {
    const selfId = taskForm.id.value;
    depPred.innerHTML = '';
    const opts = state.tasks.filter(function (t) {
      if (t.id === selfId) return false;
      // cegah dependensi ke diri sendiri lewat hierarki
      if (selfId && S.isAncestor(state.tasks, new Map(state.tasks.map(function (x) { return [x.id, x]; })), t.id, selfId)) return false;
      return true;
    });
    if (!opts.length) {
      depPred.innerHTML = '<option value="">(tidak ada tugas lain)</option>';
      return;
    }
    opts.forEach(function (t) {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = (t.code ? t.code + ' · ' : '') + t.name;
      depPred.appendChild(o);
    });
  }

  function renderDepEditor() {
    depList.innerHTML = '';
    if (!draftDeps.length) {
      depList.innerHTML = '<p class="hint">Tidak ada dependensi.</p>';
      return;
    }
    draftDeps.forEach(function (d, i) {
      const pred = findTask(d.predId);
      const row = document.createElement('div');
      row.className = 'dep-row';
      const txt = document.createElement('span');
      txt.textContent = (pred ? (pred.code ? pred.code + ' ' : '') + pred.name : '(hilang)') +
        ' — ' + (d.type || 'FS') + (d.lag ? ' +' + d.lag + ' hr' : '');
      row.appendChild(txt);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mini-btn danger';
      btn.textContent = '✕';
      btn.addEventListener('click', function () {
        draftDeps.splice(i, 1);
        renderDepEditor();
      });
      row.appendChild(btn);
      depList.appendChild(row);
    });
  }

  document.getElementById('btnAddDep').addEventListener('click', function () {
    const predId = depPred.value;
    if (!predId) return;
    const selfId = taskForm.id.value;
    if (predId === selfId) { toast('Tugas tidak bisa bergantung pada dirinya sendiri.', true); return; }
    if (draftDeps.some(function (d) { return d.predId === predId && (d.type || 'FS') === document.getElementById('depType').value; })) {
      toast('Dependensi itu sudah ada.', true);
      return;
    }
    draftDeps.push({
      predId: predId,
      type: document.getElementById('depType').value,
      lag: Math.max(0, parseInt(document.getElementById('depLag').value, 10) || 0)
    });
    document.getElementById('depLag').value = 0;
    renderDepEditor();
  });

  taskForm.addEventListener('submit', function (e) {
    e.preventDefault();
    const id = taskForm.id.value;
    const name = taskForm.name.value.trim();
    if (!name) { toast('Nama tugas wajib diisi.', true); return; }
    const isParentExisting = id ? state.tasks.some(function (x) { return x.parentId === id; }) : false;
    const parentId = editorBox.dataset.parentId || null;

    // cek sirkular dependensi sederhana
    const tmp = {
      id: id || S.uid('task'),
      deps: draftDeps, parentId: parentId
    };
    if (createsCycle(tmp)) {
      toast('Dependensi itu akan membuat siklus. Dibatalkan.', true);
      return;
    }

    let t = id ? findTask(id) : null;
    if (!t) {
      t = { id: tmp.id };
      state.tasks.push(t);
    }
    t.name = name;
    t.code = taskForm.code.value.trim();
    t.priority = taskForm.priority.value;
    t.progress = Math.min(100, Math.max(0, parseFloat(taskForm.progress.value) || 0));
    t.color = taskForm.color.value;
    t.resource = taskForm.resource.value.trim();
    t.deps = JSON.parse(JSON.stringify(draftDeps));
    t.parentId = parentId || null;
    if (!isParentExisting) {
      t.start = taskForm.start.value || null;
      t.duration = Math.max(1, parseInt(taskForm.duration.value, 10) || 1);
    } else {
      t.start = null; // induk mengikuti anak
    }

    selectedId = t.id;
    closeEditor();
    recompute();
    toast('Tugas disimpan.');
  });

  function createsCycle(candidate) {
    // DFS dari candidate sebagai predecessor apakah bisa mencapai dirinya sendiri
    const self = candidate.id;
    const edges = new Map();
    state.tasks.forEach(function (t) {
      edges.set(t.id, (t.id === self ? candidate.deps : (t.deps || [])).map(function (d) { return d.predId; }));
    });
    if (!edges.has(self)) edges.set(self, candidate.deps.map(function (d) { return d.predId; }));
    const seen = new Set();
    const stack = (edges.get(self) || []).slice();
    while (stack.length) {
      const n = stack.pop();
      if (n === self) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      (edges.get(n) || []).forEach(function (p) { stack.push(p); });
    }
    return false;
  }

  document.getElementById('btnDeleteTask').addEventListener('click', function () {
    if (editingId) deleteTask(editingId);
  });

  function deleteTask(id) {
    const t = findTask(id);
    if (!t) return;
    const kidCount = countDescendants(id);
    const msg = kidCount
      ? 'Hapus "' + t.name + '" beserta ' + kidCount + ' subtugas turunannya?'
      : 'Hapus "' + t.name + '"?';
    if (!confirm(msg)) return;
    // kumpulkan semua id yang dihapus
    const toRemove = new Set([id]);
    (function collect(pid) {
      state.tasks.forEach(function (x) {
        if (x.parentId === pid && !toRemove.has(x.id)) {
          toRemove.add(x.id);
          collect(x.id);
        }
      });
    })(id);
    state.tasks = state.tasks.filter(function (x) { return !toRemove.has(x.id); });
    // bersihkan dependensi yang menunjuk ke yang dihapus
    state.tasks.forEach(function (x) {
      x.deps = (x.deps || []).filter(function (d) { return !toRemove.has(d.predId); });
    });
    if (selectedId && toRemove.has(selectedId)) selectedId = null;
    if (editingId && toRemove.has(editingId)) closeEditor();
    recompute();
    toast('Tugas dihapus.');
  }

  function countDescendants(id) {
    let n = 0;
    (function walk(pid) {
      state.tasks.forEach(function (x) {
        if (x.parentId === pid) { n++; walk(x.id); }
      });
    })(id);
    return n;
  }

  document.getElementById('btnAddTask').addEventListener('click', function () {
    selectedId = null;
    openEditor(null, null);
  });
  document.getElementById('btnAddSubtask').addEventListener('click', function () {
    if (!selectedId) return;
    openEditor(null, selectedId);
  });

  /* ---------- Tombol atas: contoh / ekspor / impor / reset ---------- */
  document.getElementById('btnSample').addEventListener('click', function () {
    if (state.tasks.length &&
        !confirm('Muat contoh akan menimpa semua data saat ini. Lanjutkan?')) return;
    state = S.sampleData();
    selectedId = null;
    closeEditor();
    syncProjectForm();
    recompute();
    // auto-expand semua
    ui.collapsed.clear();
    toast('Contoh studi kasus Sasa Store dimuat.');
  });

  document.getElementById('btnExport').addEventListener('click', function () {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    const nm = (state.project.name || 'proyek').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = URL.createObjectURL(blob);
    a.download = (nm || 'proyek') + '-ganttlite.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast('Data diekspor ke JSON.');
  });

  document.getElementById('importFile').addEventListener('change', function (e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const st = normalizeState(JSON.parse(reader.result));
        state = st;
        selectedId = null;
        closeEditor();
        syncProjectForm();
        recompute();
        toast('Data berhasil diimpor.');
      } catch (err) {
        toast('File JSON tidak valid: ' + err.message, true);
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btnReset').addEventListener('click', function () {
    if (!confirm('Hapus SEMUA data proyek di browser ini?')) return;
    state = blankState();
    selectedId = null;
    closeEditor();
    syncProjectForm();
    recompute();
    toast('Data direset.');
  });

  /* ---------- Zoom & critical toggle ---------- */
  document.querySelectorAll('.zoom-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.zoom-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      ui.colWidth = parseInt(b.dataset.zoom, 10);
      renderGantt();
    });
  });
  document.getElementById('chkCritical').addEventListener('change', function (e) {
    ui.showCritical = e.target.checked;
    renderGantt();
    renderStats();
  });

  /* ---------- Panel toggle (collapse) ---------- */
  document.querySelectorAll('.panel-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const body = document.getElementById(btn.dataset.target);
      const closed = body.classList.toggle('collapsed');
      btn.querySelector('.caret').textContent = closed ? '▸' : '▾';
    });
  });

  /* ---------- Init ---------- */
  syncProjectForm();
  recompute();
})();
