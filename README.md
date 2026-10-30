# Ruang Nilai Sekolah
Starter repository aplikasi nilai sederhana berbasis **GitHub Pages + Supabase**.

## Fitur starter
- Login email/password melalui Supabase Auth.
- Peran `admin`, `guru`, dan `siswa`.
- Guru melihat penugasan kelas/mapel, memilih siswa, lalu menyimpan nilai 0–100.
- Siswa hanya membaca nilai yang terhubung ke profilnya.
- Admin melihat ringkasan dan mengelola master data melalui Supabase Dashboard.
- Ekspor nilai ke CSV.
- Kebijakan Row Level Security (RLS) sebagai lapisan otorisasi database.

> Ini adalah starter project, bukan sistem akademik produksi yang sudah diaudit. Uji kebijakan akses dengan akun percobaan sebelum memasukkan data siswa sungguhan.

## 1. Buat proyek Supabase
1. Buka https://supabase.com/ lalu buat proyek.
2. Buka **SQL Editor**.
3. Jalankan seluruh isi `supabase/schema.sql`.
4. Buka **Project Settings > API** (atau API Keys).
5. Salin Project URL dan publishable key. Pada proyek lama, gunakan anon/public key.
6. Masukkan kedua nilai tersebut ke `assets/config.js`.

**Jangan pernah memasukkan `service_role` / secret key ke file frontend, repository, atau browser.** File `config.js` berisi key publik yang memang dapat dilihat pengguna. Keamanan data bergantung pada RLS.

## 2. Buat akun pengguna
Untuk tahap awal, admin membuat akun melalui **Supabase Dashboard > Authentication > Users > Add user**. Nonaktifkan pendaftaran publik jika tidak diperlukan.

Setiap akun baru otomatis mendapat baris profil dengan role default `siswa`. Setelah akun dibuat, admin perlu menautkan profil dengan data siswa atau menetapkan peran guru/admin.

### Mengatur admin pertama
Setelah membuat akun admin melalui Dashboard, buka SQL Editor dan jalankan (ganti email):
```sql
update public.profiles p
set role = 'admin', display_name = 'Administrator'
from auth.users u
where p.id = u.id and u.email = 'admin@sekolah.sch.id';
```

### Menyiapkan kelas, mapel, guru, dan siswa
Buat kelas dan mapel:
```sql
insert into public.classes(name) values ('VII A'), ('VII B');
insert into public.subjects(name) values ('Bahasa Indonesia'), ('Informatika'), ('PAI');
```

Buat akun guru dan siswa dahulu melalui Authentication > Users. Profil otomatis terbentuk. Lalu admin dapat mengisi data master lewat SQL Editor. Contoh:
```sql
-- Cari UUID akun melalui Authentication > Users atau:
select id, email from auth.users;

-- Atur profil guru
update public.profiles
set role = 'guru', display_name = 'Nama Guru'
where id = 'UUID-AKUN-GURU';

-- Tambahkan siswa dan hubungkan ke akun siswa
insert into public.students(profile_id, student_number, name, class_id)
values (
  'UUID-AKUN-SISWA',
  '2026001',
  'Nama Siswa',
  (select id from public.classes where name = 'VII A')
);

-- Tugaskan guru ke kelas dan mapel
insert into public.teacher_assignments(teacher_id, class_id, subject_id)
values (
  'UUID-AKUN-GURU',
  (select id from public.classes where name = 'VII A'),
  (select id from public.subjects where name = 'Bahasa Indonesia')
);
```

Untuk siswa yang belum memiliki akun, `profile_id` boleh NULL. Hubungkan setelah akun dibuat. Pastikan satu akun siswa hanya dihubungkan ke satu baris siswa.

## 3. Jalankan lokal
Karena aplikasi menggunakan JavaScript module, jalankan melalui local web server, bukan membuka file HTML langsung. Contoh jika Python tersedia:
```bash
python -m http.server 8000
```
Lalu buka http://localhost:8000.

## 4. Terbitkan di GitHub Pages
1. Buat repository GitHub, misalnya `ruang-nilai-sekolah`.
2. Upload seluruh isi folder ini ke root repository.
3. Buka **Settings > Pages**.
4. Pada Build and deployment pilih **Deploy from a branch**.
5. Pilih branch `main`, folder `/ (root)`, lalu Save.
6. Tunggu proses deployment. URL biasanya `https://USERNAME.github.io/ruang-nilai-sekolah/`.

Repository publik berarti semua file frontend dapat dibaca siapa pun. Jangan menyimpan data siswa, password, token rahasia, backup database, atau file konfigurasi rahasia di repository.

## 5. Cara kerja aplikasi
- Login: Supabase Auth.
- Baca profil: `profiles`.
- Guru: `teacher_assignments`, `classes`, `subjects`, `students`, `grades`.
- Siswa: hanya baris `grades` yang lolos RLS karena `students.profile_id` terhubung ke akun yang login.
- Simpan: `upsert` berdasarkan kombinasi siswa, mapel, jenis penilaian, semester, dan tahun ajaran.
- Ekspor: CSV dibuat di browser dari data yang boleh dibaca pengguna.

## 6. Batasan versi awal
- Input nilai satu siswa per penyimpanan; belum ada input massal satu kelas.
- Pengelolaan akun, kelas, mapel, siswa, dan penugasan dilakukan dari Supabase Dashboard/SQL Editor.
- Admin aplikasi belum memiliki halaman CRUD untuk master data.
- Belum ada reset password kustom, audit log rinci, impor CSV, rapor, atau cetak PDF.
- Aplikasi memakai CDN untuk Supabase SDK dan Google Fonts; butuh koneksi internet.
- Admin dapat membaca semua nilai melalui kebijakan database, tetapi panel admin saat ini hanya menampilkan ringkasan.
- Skema ini merupakan fondasi awal. Minta pemeriksaan teknis/keamanan sebelum digunakan untuk data resmi.

## 7. Checklist keamanan sebelum dipakai
- [ ] Matikan sign-up publik bila hanya admin yang membuat akun.
- [ ] Pastikan semua tabel yang berisi data pribadi mengaktifkan RLS.
- [ ] Uji akun siswa A tidak dapat membaca nilai siswa B.
- [ ] Uji guru A tidak dapat mengakses kelas/mapel yang tidak ditugaskan.
- [ ] Uji guru tidak dapat mengubah role dirinya menjadi admin.
- [ ] Jangan pernah mengirim service role key ke frontend.
- [ ] Gunakan kata sandi unik dan aktifkan MFA untuk admin jika tersedia.
- [ ] Buat backup berkala dan batasi siapa yang dapat mengunduhnya.
- [ ] Ikuti kebijakan privasi sekolah dan aturan perlindungan data pribadi anak.

## Dokumentasi
- GitHub Pages: https://docs.github.com/en/pages
- Supabase Auth: https://supabase.com/docs/guides/auth
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase JavaScript: https://supabase.com/docs/reference/javascript/introduction
