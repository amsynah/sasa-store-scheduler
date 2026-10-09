// Uji logika scheduler terhadap studi kasus Sasa Store
const S = require('./scheduler.js');

const data = S.sampleData();
const sched = S.computeSchedule(data.project, data.calendar, data.tasks);

function f(d) { return S.d2s(d); }
let pass = 0, fail = 0;
function check(label, actual, expected) {
  const ok = String(actual) === String(expected);
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + label + ' = ' + actual + (ok ? '' : ' (diharapkan ' + expected + ')'));
}

const byCode = {};
data.tasks.forEach(t => byCode[t.code] = t);
const sc = id => sched.byId.get(id);

// 1. Proyek selesai 18 November 2026
check('Selesai proyek', f(sched.projectEnd), '2026-11-18');
// 2. Mulai 12 Oktober 2026
check('Mulai proyek', f(sched.projectStart), '2026-10-12');
// 3. A: 12-14 Okt (3 hari kerja, Sabtu-Minggu libur)
check('A start', f(sc(byCode.A.id).start), '2026-10-12');
check('A end', f(sc(byCode.A.id).end), '2026-10-14');
check('A durasi', sc(byCode.A.id).duration, 3);
// 4. A induk mengikuti anak (subtugas A juga 12-14 Okt)
const anakA = data.tasks.filter(t => t.parentId === byCode.A.id);
const minAnak = anakA.reduce((m, t) => { const s = sc(t.id).start; return (m === null || s < m) ? s : m; }, null);
const maxAnak = anakA.reduce((m, t) => { const e = sc(t.id).end; return (m === null || e > m) ? e : m; }, null);
check('Induk A start = min anak', f(sc(byCode.A.id).start), f(minAnak));
check('Induk A end = max anak', f(sc(byCode.A.id).end), f(maxAnak));
// 5. B setelah A: FS → mulai 15 Okt (Kamis), 5 hr → 21 Okt
check('B start', f(sc(byCode.B.id).start), '2026-10-15');
check('B end', f(sc(byCode.B.id).end), '2026-10-21');
// 6. C: 3 hr dari 15 Okt → 19 Okt
check('C end', f(sc(byCode.C.id).end), '2026-10-19');
// 7. D menunggu B & C → start 22 Okt, 7 hr → 2 Nov (lewati libur 28 Okt)
check('D start', f(sc(byCode.D.id).start), '2026-10-22');
check('D end', f(sc(byCode.D.id).end), '2026-11-02');
check('D melewati libur 28 Okt', f(sc(byCode.D.id).end) >= '2026-11-01', 'true');
// 8. G: SS dari C + delay 2 hr → start = C.start + 2 hr = 19 Okt
check('G start (SS+2)', f(sc(byCode.G.id).start), '2026-10-19');
// 9. E setelah D: 6 hr → 3-10 Nov
check('E start', f(sc(byCode.E.id).start), '2026-11-03');
check('E end', f(sc(byCode.E.id).end), '2026-11-10');
// 10. I setelah E,F,G,H → start 11 Nov, 4 hr → 16 Nov
check('I start', f(sc(byCode.I.id).start), '2026-11-11');
check('I end', f(sc(byCode.I.id).end), '2026-11-16');
// 11. J: 2 hr → 17-18 Nov
check('J end', f(sc(byCode.J.id).end), '2026-11-18');
// 12. Total hari kerja proyek = 27
check('Total hari kerja', sched.totalWorkdays, 27);
// 13. Jalur kritis = A,B,D,E,I,J
const critCodes = sched.criticalPath.map(id => {
  const t = data.tasks.find(x => x.id === id);
  return t ? t.code : '?';
});
check('Jalur kritis', critCodes.join('-'), 'A-B-D-E-I-J');
check('Jumlah kritis', sched.criticalPath.length, 6);
// 14. Semua tugas terjadwal
check('Semua tugas terjadwal', sched.byId.size, data.tasks.length);
// 15. G tidak di jalur kritis (start lebih awal dari kebutuhan)
check('G bukan kritis', sched.critical.has(byCode.G.id) ? 'ya' : 'tidak', 'tidak');

// Uji weekend 'work' (Sabtu-Minggu tetap jalan)
const d2 = S.sampleData();
d2.calendar.sat = 'work';
d2.calendar.sun = 'work';
const s2 = S.computeSchedule(d2.project, d2.calendar, d2.tasks);
check('Weekend kerja: selesai lebih awam', f(s2.projectEnd) < '2026-11-18', 'true');

// Uji libur recurring
const cal3 = { sat: 'off', sun: 'off', holidays: [{ id: 'x', date: '2026-10-28', name: 'H', recurring: true }] };
check('Libur 28 Okt 2026 bukan hari kerja', S.isWorkday(cal3, S.s2d('2026-10-28')), false);
check('Libur 28 Okt 2027 bukan hari kerja (recurring)', S.isWorkday(cal3, S.s2d('2027-10-28')), false);
check('29 Okt 2026 hari kerja', S.isWorkday(cal3, S.s2d('2026-10-29')), true);

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail ? 1 : 0);
