import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.APP_CONFIG || {};
const configured = cfg.SUPABASE_URL && !cfg.SUPABASE_URL.includes("YOUR-PROJECT")
  && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_ANON_KEY.includes("YOUR_SUPABASE");
const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

if (!configured) {
  $("setup-notice").classList.remove("hidden");
} else {
  const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  let currentUser = null, profile = null, assignments = [], students = [], subjects = [], classes = [], gradeCache = [];

  const msg = (id, text, type="") => {
    const el = $(id); el.textContent = text; el.className = `form-message ${type}`;
  };
  const show = (id, yes=true) => $(id).classList.toggle("hidden", !yes);
  const safe = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const dateFmt = (v) => v ? new Date(v).toLocaleString("id-ID") : "-";

  $("login-form").addEventListener("submit", async (e) => {
    e.preventDefault(); msg("auth-message", "Memeriksa akun...");
    const { error } = await supabase.auth.signInWithPassword({
      email: $("email").value.trim(), password: $("password").value
    });
    if (error) msg("auth-message", error.message, "error");
  });
  $("logout-btn").addEventListener("click", async () => { await supabase.auth.signOut(); });

  supabase.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => session ? loadApp(session.user) : resetApp(), 0);
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await loadApp(session.user);

  function resetApp() {
    currentUser = null; profile = null;
    show("auth-view"); show("app-view", false); show("logout-btn", false);
    $("user-label").textContent = "";
  }

  async function loadApp(user) {
    currentUser = user;
    show("auth-view", false); show("app-view"); show("logout-btn");
    $("user-label").textContent = user.email || "";
    msg("global-message", "Memuat profil...");
    const { data, error } = await supabase.from("profiles").select("id, display_name, role").eq("id", user.id).single();
    if (error || !data) {
      msg("global-message", "Profil belum disiapkan admin. Hubungi administrator sekolah.", "error");
      return;
    }
    profile = data;
    $("welcome-title").textContent = `Halo, ${profile.display_name || user.email}`;
    $("welcome-subtitle").textContent = "Berikut ringkasan aktivitas akademik akun Anda.";
    $("role-pill").textContent = ({admin:"ADMIN",guru:"GURU",siswa:"SISWA"}[profile.role] || "PENGGUNA");
    show("teacher-panel", profile.role === "admin" || profile.role === "guru");
    show("student-panel", profile.role === "siswa");
    show("admin-panel", profile.role === "admin");
    if (profile.role === "admin" || profile.role === "guru") await loadTeacher();
    if (profile.role === "siswa") await loadStudent();
    if (profile.role === "admin") await loadAdmin();
    msg("global-message", "");
  }

  async function loadTeacher() {
    let query = supabase.from("teacher_assignments")
      .select("class_id, subject_id, classes(id,name), subjects(id,name)")
      .eq("teacher_id", currentUser.id);
    const { data, error } = await query;
    if (error) { msg("grade-message", error.message, "error"); return; }
    assignments = data || [];
    if (profile.role === "admin") {
      const [c, s] = await Promise.all([
        supabase.from("classes").select("id,name").order("name"),
        supabase.from("subjects").select("id,name").order("name")
      ]);
      if (c.error || s.error) { msg("grade-message", c.error?.message || s.error?.message, "error"); return; }
      classes = c.data || []; subjects = s.data || [];
      // Admin mendapat opsi seluruh kelas/mapel. RLS database tetap wajib membatasi operasi.
    } else {
      classes = uniqueBy(assignments.map(a => a.classes).filter(Boolean), "id");
      subjects = uniqueBy(assignments.map(a => a.subjects).filter(Boolean), "id");
    }
    fillSelect("class-select", classes, "Pilih kelas");
    fillSelect("subject-select", subjects, "Pilih mata pelajaran");
    await refreshStudents();
    await refreshTeacherGrades();
    $("class-select").addEventListener("change", refreshStudents);
    $("export-btn").onclick = () => exportCSV("nilai-guru.csv", gradeCache.map(g => ({
      siswa:g.students?.name, kelas:g.classes?.name, mapel:g.subjects?.name,
      penilaian:g.assessment, semester:g.term, tahun_ajaran:g.school_year,
      nilai:g.score, catatan:g.notes, diubah:g.updated_at
    })));
  }

  function uniqueBy(arr, key) { return [...new Map(arr.map(x => [x[key], x])).values()]; }
  function fillSelect(id, rows, placeholder) {
    const el = $(id); el.innerHTML = `<option value="">${placeholder}</option>` +
      rows.map(r => `<option value="${safe(r.id)}">${safe(r.name)}</option>`).join("");
  }

  async function refreshStudents() {
    const classId = $("class-select").value;
    if (!classId) { fillSelect("student-select", [], "Pilih siswa"); return; }
    const { data, error } = await supabase.from("students").select("id,name,class_id")
      .eq("class_id", classId).eq("active", true).order("name");
    if (error) { msg("grade-message", error.message, "error"); return; }
    students = data || []; fillSelect("student-select", students, "Pilih siswa");
  }

  async function refreshTeacherGrades() {
    const { data, error } = await supabase.from("grades")
      .select("id,assessment,term,school_year,score,notes,updated_at,students(name),classes(name),subjects(name)")
      .order("updated_at", {ascending:false}).limit(300);
    if (error) { msg("grade-message", error.message, "error"); return; }
    gradeCache = data || [];
    $("teacher-grades").innerHTML = gradeCache.map(g => `<tr>
      <td>${safe(g.students?.name)}</td><td>${safe(g.classes?.name)}</td><td>${safe(g.subjects?.name)}</td>
      <td>${safe(g.assessment)}</td><td>${safe(g.term)}</td><td><strong>${safe(g.score)}</strong></td><td>${safe(dateFmt(g.updated_at))}</td></tr>`).join("")
      || `<tr><td colspan="7">Belum ada data nilai yang dapat ditampilkan.</td></tr>`;
    $("stats").innerHTML = stat("Data nilai", gradeCache.length) + stat("Kelas ditugaskan", classes.length) + stat("Mapel tersedia", subjects.length);
  }

  $("grade-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {
      student_id:$("student-select").value, class_id:$("class-select").value,
      subject_id:$("subject-select").value, assessment:$("assessment").value.trim(),
      term:$("term").value, school_year:$("school-year").value.trim(),
      score:Number($("score").value), notes:$("notes").value.trim() || null,
      entered_by:currentUser.id
    };
    if (!payload.student_id || !payload.class_id || !payload.subject_id || !payload.assessment || !payload.school_year ||
        !Number.isFinite(payload.score) || payload.score < 0 || payload.score > 100) {
      msg("grade-message", "Periksa kembali data. Nilai harus berada pada rentang 0–100.", "error"); return;
    }
    msg("grade-message", "Menyimpan nilai...");
    const { error } = await supabase.from("grades").upsert(payload, {
      onConflict:"student_id,subject_id,assessment,term,school_year"
    });
    if (error) { msg("grade-message", error.message, "error"); return; }
    msg("grade-message", "Nilai berhasil disimpan.", "success");
    $("score").value = ""; $("notes").value = "";
    await refreshTeacherGrades();
  });

  async function loadStudent() {
    const { data, error } = await supabase.from("grades")
      .select("assessment,term,school_year,score,notes,updated_at,subjects(name)")
      .order("updated_at", {ascending:false}).limit(500);
    if (error) { msg("global-message", error.message, "error"); return; }
    const rows = data || [];
    $("student-grades").innerHTML = rows.map(g => `<tr><td>${safe(g.subjects?.name)}</td><td>${safe(g.assessment)}</td>
      <td>${safe(g.term)}</td><td>${safe(g.school_year)}</td><td><strong>${safe(g.score)}</strong></td><td>${safe(g.notes || "-")}</td></tr>`).join("")
      || `<tr><td colspan="6">Belum ada nilai yang diterbitkan.</td></tr>`;
    $("stats").innerHTML = stat("Jumlah nilai", rows.length) + stat("Rata-rata", rows.length ? (rows.reduce((a,b)=>a+Number(b.score),0)/rows.length).toFixed(2) : "-");
    $("student-export-btn").onclick = () => exportCSV("nilai-saya.csv", rows.map(g => ({
      mapel:g.subjects?.name, penilaian:g.assessment, semester:g.term,
      tahun_ajaran:g.school_year, nilai:g.score, catatan:g.notes
    })));
  }

  async function loadAdmin() {
    const [a,b,c] = await Promise.all([
      supabase.from("profiles").select("id", {count:"exact",head:true}),
      supabase.from("students").select("id", {count:"exact",head:true}),
      supabase.from("grades").select("id", {count:"exact",head:true})
    ]);
    $("admin-summary").innerHTML = `<span>Pengguna: <strong>${a.count ?? "-"}</strong></span><span>Siswa: <strong>${b.count ?? "-"}</strong></span><span>Catatan nilai: <strong>${c.count ?? "-"}</strong></span>`;
    $("stats").innerHTML = stat("Pengguna", a.count ?? "-") + stat("Siswa", b.count ?? "-") + stat("Catatan nilai", c.count ?? "-");
  }

  function stat(label, value) { return `<div class="stat"><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`; }
  function exportCSV(filename, rows) {
    if (!rows.length) { msg("global-message", "Tidak ada data untuk diekspor.", "error"); return; }
    const headers = [...new Set(rows.flatMap(r => Object.keys(r)))];
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String(r[h] ?? "").replace(/"/g,'""')}"`).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], {type:"text/csv;charset=utf-8;"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
}
