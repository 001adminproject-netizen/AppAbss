
function showToast(message, type = 'info', duration = 4200) {
  const host = document.getElementById('app-notifications');
  if (!host) { window.alert(String(message)); return; }
  const toast = document.createElement('div');
  if (type === 'info' && /gagal|ditolak|tidak valid|belum|harus|error|terlalu jauh/i.test(String(message))) type = 'error';
  else if (type === 'info' && /berhasil|sukses|terkirim/i.test(String(message))) type = 'success';
  toast.className = `app-toast ${['success','error','info'].includes(type) ? type : 'info'}`;
  const icon = type === 'success' ? 'fa-circle-check' : type === 'error' ? 'fa-circle-exclamation' : 'fa-bell';
  const msg = document.createElement('div');
  msg.className = 'toast-message';
  msg.textContent = String(message || 'Proses selesai.');
  const ico = document.createElement('i');
  ico.className = `fa-solid ${icon} mt-1`;
  const close = document.createElement('button');
  close.className = 'toast-close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Tutup notifikasi');
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  close.addEventListener('click', () => toast.remove());
  toast.append(ico, msg, close);
  host.appendChild(toast);
  window.setTimeout(() => { if (toast.isConnected) toast.remove(); }, duration);
}

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxANnx_VfPzPdtTeaf-G943Yw_SMHigRfYfx5pXz_emj23Mht0IJlDNPwqdbfl0VDYG/exec";

let currentUser = null;
let targetLocation = null;
let capturedBase64 = "";
let rawAllDetails = []; 
let activeUserList = [];
let allSchedulesList = [];

let adminMap = null;
let adminMarker = null;

document.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem('pkl_current_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      document.getElementById('view-auth').classList.add('d-none');
      if (currentUser.role === 'admin') {
        showAdminView();
      } else {
        showUserView();
      }
    } catch (e) {
      localStorage.removeItem('pkl_current_user');
    }
  }
});

function formatIndonesianDate(dateStr) {
  if (!dateStr || dateStr === '-') return '-';
  if (dateStr.includes(',')) return dateStr;

  try {
    const parts = dateStr.split('T')[0].split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);

      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

      return `${days[d.getDay()]}, ${String(day).padStart(2, '0')} ${months[month]} ${year}`;
    }
  } catch (e) {}
  return dateStr;
}

function showLoading(msg = 'Memproses data...') {
  document.getElementById('loading-text').innerText = msg;
  document.getElementById('loading-overlay').classList.remove('d-none');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('d-none');
}

function openAbsenModal(type) {
  const absenTipe = document.getElementById('absen-tipe');
  if (absenTipe) {
    absenTipe.value = type;
    handleAbsenTypeChange();
  }
  switchUserTab('absen');
}

function switchUserTab(targetPage) {
  const activeBtn = document.getElementById(`btn-nav-${targetPage === 'cuti-izin' ? 'izin' : targetPage}`);

  document.querySelectorAll('.mobile-nav-tabs .nav-btn').forEach(b => b.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.user-page-section').forEach(sec => sec.classList.add('d-none'));

  const targetSec = document.getElementById(`page-user-${targetPage}`);
  if (targetSec) {
    targetSec.classList.remove('d-none');
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  refreshCurrentPageData(targetPage);
}

function refreshCurrentPageData(page) {
  if (!currentUser) return;

  switch (page) {
    case 'home':
      loadTodayAttendance();
      loadUserDashboardSummary();
      break;
    case 'absen':
      loadTodayAttendance();
      break;
    case 'cuti-izin':
      loadMyCutiIzinHistory();
      break;
    case 'riwayat':
      loadMyAttendanceHistory();
      break;
    case 'jadwal':
      loadMySchedule();
      break;
    case 'profil':
      renderUserProfile();
      break;
  }
}

async function callAppsScript(action, payload = {}) {
  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ action, ...payload })
    });
    return await response.json();
  } catch (error) {
    return { success: false, message: 'Gagal terhubung ke server backend.' };
  }
}

function toggleAuthMode(mode) {
  document.getElementById('auth-alert').innerHTML = '';
  if (mode === 'register') {
    document.getElementById('form-login').classList.add('d-none');
    document.getElementById('form-register').classList.remove('d-none');
    document.getElementById('auth-subtitle').innerText = 'Pendaftaran Akun PKL Baru';
  } else {
    document.getElementById('form-register').classList.add('d-none');
    document.getElementById('form-login').classList.remove('d-none');
    document.getElementById('auth-subtitle').innerText = 'Silakan masuk ke akun Anda';
  }
}

async function handleLogin() {
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-password').value;

  showLoading('Memverifikasi akun...');
  const res = await callAppsScript('login', { username: u, password: p });
  hideLoading();

  if (res.success) {
    currentUser = res.user;
    localStorage.setItem('pkl_current_user', JSON.stringify(currentUser));

    document.getElementById('view-auth').classList.add('d-none');
    if (currentUser.role === 'admin') {
      showAdminView();
    } else {
      showUserView();
    }
  } else {
    document.getElementById('auth-alert').innerHTML = `<div class="alert alert-danger py-2 small">${res.message}</div>`;
  }
}

async function handleRegister() {
  const userData = {
    nama: document.getElementById('reg-nama').value,
    asalSekolah: document.getElementById('reg-asal-sekolah').value,
    username: document.getElementById('reg-username').value,
    password: document.getElementById('reg-password').value,
    tglMulai: document.getElementById('reg-mulai').value,
    tglSelesai: document.getElementById('reg-selesai').value
  };

  showLoading('Mengirim pendaftaran akun...');
  const res = await callAppsScript('register', { userData });
  hideLoading();

  if (res.success) {
    document.getElementById('auth-alert').innerHTML = `<div class="alert alert-success py-2 small">${res.message}</div>`;
    toggleAuthMode('login');
    document.getElementById('form-register').reset();
  } else {
    document.getElementById('auth-alert').innerHTML = `<div class="alert alert-danger py-2 small">${res.message}</div>`;
  }
}

function showUserView() {
  document.body.classList.remove('admin-mode');
  document.getElementById('view-user').classList.remove('d-none');
  document.getElementById('user-welcome').innerText = currentUser.nama;
  document.getElementById('user-school').innerText = currentUser.asalSekolah || "Siswa / Mahasiswa";
  
  const instansiCard = document.getElementById('user-instansi-card');
  if (instansiCard) instansiCard.innerText = currentUser.asalSekolah || "Sistem Absensi PKL";

  switchUserTab('home');
  renderUserProfile();
  fetchLocationSettings();
  handleAbsenTypeChange();
}

async function loadUserDashboardSummary() {
  const res = await callAppsScript('getMyAttendanceHistory', { username: currentUser.username });
  if (res && res.success) {
    const list = res.data || [];
    let masukCount = 0;
    let izinCount = 0;

    list.forEach(item => {
      let st = (item.status || '').toUpperCase();
      if (st === 'HADIR' || st === 'MASUK') {
        masukCount++;
      } else if (st === 'IZIN' || st === 'SAKIT' || st === 'CUTI') {
        izinCount++;
      }
    });

    const statKehadiran = document.getElementById('stat-kehadiran');
    const statIzin = document.getElementById('stat-izin');
    if (statKehadiran) statKehadiran.innerText = masukCount;
    if (statIzin) statIzin.innerText = izinCount;
  }
}

function renderUserProfile() {
  if (!currentUser) return;
  const values = {
    'profile-nama': currentUser.nama || '-',
    'profile-username': currentUser.username ? '@' + currentUser.username : '-',
    'profile-sekolah': currentUser.asalSekolah || '-',
    'profile-mulai': currentUser.tglMulai || '-',
    'profile-selesai': currentUser.tglSelesai || '-'
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function handleShiftChange() {
  const shift = document.getElementById('absen-shift').value;
  const day = new Date().getDay();
  const isWeekend = (day === 0 || day === 6);

  if (isWeekend) {
    showToast("Info jadwal: akhir pekan tetap mengikuti jadwal yang ditetapkan admin.", "info");
  } else if (shift === 'SIANG') {
    showToast("Shift Siang dipilih. Pastikan shift ini sesuai jadwal admin.", "info");
  } else {
    showToast("Shift Pagi dipilih. Pastikan shift ini sesuai jadwal admin.", "info");
  }
}

function handleAbsenTypeChange() {
  const tipe = document.getElementById('absen-tipe').value;
  const cameraSection = document.getElementById('wrapper-camera-section');
  const groupKegiatan = document.getElementById('group-kegiatan');
  const groupKeteranganMasuk = document.getElementById('group-keterangan-masuk');

  if (tipe === 'PULANG') {
    cameraSection.classList.remove('d-none');
    groupKegiatan.classList.remove('d-none');
    groupKeteranganMasuk.classList.add('d-none');
  } else {
    cameraSection.classList.remove('d-none');
    groupKegiatan.classList.add('d-none');
    groupKeteranganMasuk.classList.remove('d-none');
  }
}

function openNativeCamera() {
  document.getElementById('input-native-camera').click();
}

function previewFotoFromCamera(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      capturedBase64 = e.target.result;
      const img = document.getElementById('preview-img');
      const placeholder = document.getElementById('placeholder-box');
      img.src = capturedBase64;
      img.classList.remove('d-none');
      placeholder.classList.add('d-none');
    };
    reader.readAsDataURL(file);
  }
}

function processAbsen() {
  const tipe = document.getElementById('absen-tipe').value;
  const shift = document.getElementById('absen-shift').value;

  if (!currentUser) return logout();

  showLoading('Mengecek lokasi & presensi...');

  let detailText = "";
  if (tipe === 'MASUK') detailText = document.getElementById('absen-keterangan-masuk').value.trim();
  if (tipe === 'PULANG') detailText = document.getElementById('absen-kegiatan').value.trim();

  const today = new Date();
  const dayOfWeek = today.getDay(); 
  const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
  const isShiftSiangBebas = (shift === 'SIANG');
  
  const wajibRadius = !currentUser.bebasLokasi && !isShiftSiangBebas && !isWeekend;

  if (wajibRadius && (tipe === 'MASUK' || tipe === 'PULANG')) {
    if (!navigator.geolocation) {
      hideLoading();
      return showToast("Browser tidak mendukung GPS.");
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (!targetLocation || !targetLocation.lat) {
          executeSubmitAbsen(tipe, shift, detailText);
          return;
        }
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, targetLocation.lat, targetLocation.lng);
        if (dist > 100) {
          hideLoading();
          showToast(`Posisi Anda terlalu jauh (${Math.round(dist)}m dari kantor). Radius maksimal 100m.`);
        } else {
          executeSubmitAbsen(tipe, shift, detailText);
        }
      },
      err => {
        hideLoading();
        showToast("Gagal membaca GPS. Pastikan Izin Lokasi aktif!");
      }
    );
  } else {
    executeSubmitAbsen(tipe, shift, detailText);
  }
}

async function executeSubmitAbsen(tipe, shift, textDetail) {
  if ((tipe === 'MASUK' || tipe === 'PULANG') && !capturedBase64) {
    hideLoading();
    return showToast("Harap ambil foto selfie terlebih dahulu!");
  }

  showLoading('Mengirim data absensi...');

  const payload = {
    username: currentUser.username,
    nama: currentUser.nama,
    tipe: tipe,
    shift: shift,
    kegiatan: tipe === 'PULANG' ? textDetail : '',
    keterangan: tipe === 'MASUK' ? textDetail : '',
    fotoDataUrl: capturedBase64
  };

  const res = await callAppsScript('submitAttendance', { payload });
  hideLoading();
  
  showToast(res.message);
  
  if (res.success) {
    document.getElementById('absen-kegiatan').value = '';
    document.getElementById('absen-keterangan-masuk').value = '';
    capturedBase64 = "";
    document.getElementById('preview-img').classList.add('d-none');
    document.getElementById('placeholder-box').classList.remove('d-none');
    switchUserTab('home');
  }
}

async function loadTodayAttendance() {
  const container = document.getElementById('today-records-container');
  const res = await callAppsScript('getTodayAttendance', { username: currentUser.username });
  const records = res.records;

  if (!records) {
    if (container) container.innerHTML = `<p class="text-muted small text-center my-2">Belum ada catatan absen hari ini.</p>`;
    const checkinElem = document.getElementById('card-checkin-time');
    const checkoutElem = document.getElementById('card-checkout-time');
    if (checkinElem) checkinElem.innerText = '--:-- WIB';
    if (checkoutElem) checkoutElem.innerText = '--:-- WIB';
    const syncElem = document.getElementById('sync-time-text');
    if (syncElem) syncElem.innerText = 'Belum Absen';
    return;
  }

  if (records.jamMasuk && records.jamMasuk !== '-') {
    const checkinElem = document.getElementById('card-checkin-time');
    if (checkinElem) checkinElem.innerText = records.jamMasuk + ' WIB';
  }

  if (records.jamPulang && records.jamPulang !== '-') {
    const checkoutElem = document.getElementById('card-checkout-time');
    if (checkoutElem) checkoutElem.innerText = records.jamPulang + ' WIB';
  }

  const syncElem = document.getElementById('sync-time-text');
  if (syncElem && records.status) {
    syncElem.innerText = `${records.status} (${records.jamMasuk || '-'})`;
  }

  if (container) {
    container.innerHTML = `
      <div class="p-2 bg-light rounded-3 border">
        <div class="d-flex justify-content-between align-items-center">
          <span class="badge bg-primary">${records.status}: ${records.jamMasuk}</span>
          <small class="fw-bold text-secondary">${records.keterlambatan}</small>
        </div>
        ${records.jamPulang && records.jamPulang !== '-' ? `<div class="mt-1"><span class="badge bg-dark">PULANG: ${records.jamPulang}</span></div>` : ''}
        <div class="small text-muted mt-1"><b>Laporan/Ket:</b> ${records.kegiatan || records.alasan || '-'}</div>
      </div>
    `;
  }
}

async function handleSubmitCutiIzin() {
  const tglMulai = document.getElementById('cuti-tgl-mulai').value;
  const tglSelesai = document.getElementById('cuti-tgl-selesai').value;
  const alasan = document.getElementById('cuti-alasan').value;
  const fileInput = document.getElementById('cuti-file');
  const file = fileInput.files[0];

  if (!tglMulai || !tglSelesai) return showToast("Pilih tanggal mulai dan selesai pengajuan!");
  if (tglMulai > tglSelesai) return showToast("Tanggal mulai tidak boleh lebih besar dari tanggal selesai!");
  if (!alasan.trim()) return showToast("Tuliskan alasan pengajuan secara jelas!");
  if (!file) return showToast("Wajib mengunggah berkas lampiran!");

  showLoading('Membaca lampiran...');
  const reader = new FileReader();
  reader.onload = async function(e) {
    const payload = {
      username: currentUser.username,
      nama: currentUser.nama,
      kategori: document.getElementById('cuti-kategori').value,
      tglMulai: tglMulai,
      tglSelesai: tglSelesai,
      alasan: alasan,
      fileBase64: e.target.result,
      fileName: file.name
    };

    showLoading('Mengirim pengajuan izin/sakit...');
    const res = await callAppsScript('submitCutiIzin', { payload });
    hideLoading();

    showToast(res.message);
    if (res.success) {
      document.getElementById('form-cuti-izin').reset();
      loadMyCutiIzinHistory();
    }
  };
  reader.readAsDataURL(file);
}

async function loadMyCutiIzinHistory() {
  const tbody = document.getElementById('table-my-cuti-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Memuat riwayat...</td></tr>';

  const res = await callAppsScript('getMyCutiIzin', { username: currentUser.username });
  const rows = res.data || [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada pengajuan.</td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><b>${r.id}</b></td>
      <td><span class="badge bg-secondary">${r.kategori}</span></td>
      <td><small>${formatIndonesianDate(r.tglMulai)} s/d ${formatIndonesianDate(r.tglSelesai)}</small></td>
      <td>
        <span class="badge ${r.status === 'APPROVED' ? 'bg-success' : r.status === 'REJECTED' ? 'bg-danger' : 'bg-warning text-dark'}">
          ${r.status}
        </span>
      </td>
    </tr>
  `).join('');
}

async function loadMyAttendanceHistory() {
  const tbody = document.getElementById('table-my-attendance-body');
  const summary = document.getElementById('my-attendance-summary');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">Memuat riwayat...</td></tr>';

  const res = await callAppsScript('getMyAttendanceHistory', { username: currentUser.username });
  const rows = res && res.success ? (res.data || []) : [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada riwayat absensi.</td></tr>';
    if (summary) summary.textContent = '';
    return;
  }

  if (summary) summary.textContent = `Total riwayat: ${rows.length} catatan`;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td><small class="fw-bold text-dark">${formatIndonesianDate(r.tanggal)}</small></td>
      <td>${r.jamMasuk || '-'}</td>
      <td>${r.jamPulang || '-'}</td>
      <td><span class="badge bg-secondary">${r.status || '-'}</span></td>
      <td><small>${r.kegiatan !== '-' ? r.kegiatan : r.alasan || '-'}</small></td>
    </tr>
  `).join('');
}

async function loadMySchedule() {
  const tbody = document.getElementById('table-my-schedule-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Memuat...</td></tr>';

  const res = await callAppsScript('getUserSchedule', { username: currentUser.username });
  const schedules = res.data || [];

  if (schedules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada jadwal shift.</td></tr>';
    return;
  }

  tbody.innerHTML = schedules.map(s => `
    <tr>
      <td><b class="text-dark">${s.tanggalFormatted || formatIndonesianDate(s.tanggal)}</b></td>
      <td><span class="badge ${s.shift === 'PAGI' ? 'bg-primary' : 'bg-success'}">${s.shift}</span></td>
      <td><small>${s.catatan || '-'}</small></td>
    </tr>
  `).join('');
}

function showAdminView() {
  document.body.classList.add('admin-mode');
  document.getElementById('view-admin').classList.remove('d-none');
  loadAdminDashboard();
  loadPendingCutiIzin();
  loadPendingUsers();
  fetchLocationSettings();
}

async function loadAdminDashboard() {
  const tbody = document.getElementById('table-rekap-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Memuat rekapitulasi...</td></tr>';

  const res = await callAppsScript('getAdminDashboard');
  if (!res || !res.success) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">${(res && res.message) || 'Gagal memuat data. Silakan perbarui kembali.'}</td></tr>`;
    return;
  }
  activeUserList = res.data || [];
  const totalMasuk = activeUserList.reduce((sum, u) => sum + Number((u.summary || {}).masuk || 0), 0);
  const totalIzin = activeUserList.reduce((sum, u) => sum + Number((u.summary || {}).izin || 0) + Number((u.summary || {}).sakit || 0), 0);
  const statUsers = document.getElementById('admin-stat-users');
  const statMasuk = document.getElementById('admin-stat-masuk');
  const statIzin = document.getElementById('admin-stat-izin');
  if (statUsers) statUsers.textContent = activeUserList.length;
  if (statMasuk) statMasuk.textContent = totalMasuk;
  if (statIzin) statIzin.textContent = totalIzin;
  const updated = document.getElementById('admin-last-updated');
  if (updated) updated.textContent = 'Diperbarui ' + new Date().toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'});

  if (!activeUserList.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Belum ada user/siswa PKL aktif.</td></tr>';
    return;
  }

  tbody.innerHTML = activeUserList.map(u => `
    <tr>
      <td><b>${u.nama}</b><br><small class="text-muted">@${u.username}</small></td>
      <td><small>${u.asalSekolah || '-'}</small></td>
      <td><small>${formatIndonesianDate(u.tglMulai)} s/d ${formatIndonesianDate(u.tglSelesai)}</small></td>
      <td>
        <span class="badge bg-success">M: ${u.summary.masuk}</span>
        <span class="badge bg-warning text-dark">I: ${u.summary.izin}</span>
        <span class="badge bg-danger">S: ${u.summary.sakit}</span>
      </td>
      <td><span class="badge bg-success">AKTIF</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-primary" onclick="openModalEditUser('${u.username}', '${u.nama}', '${u.asalSekolah}', '${u.tglMulai}', '${u.tglSelesai}')">
          <i class="fa-solid fa-edit"></i> Edit
        </button>
      </td>
    </tr>
  `).join('');
}

function openModalEditUser(username, nama, asalSekolah, tglMulai, tglSelesai) {
  document.getElementById('edit-user-username').value = username;
  document.getElementById('edit-user-nama').value = nama;
  document.getElementById('edit-user-sekolah').value = asalSekolah !== 'null' ? asalSekolah : '';
  document.getElementById('edit-user-mulai').value = tglMulai;
  document.getElementById('edit-user-selesai').value = tglSelesai;

  const modal = new bootstrap.Modal(document.getElementById('modalEditUser'));
  modal.show();
}

async function saveEditUser() {
  const payload = {
    username: document.getElementById('edit-user-username').value,
    nama: document.getElementById('edit-user-nama').value,
    asalSekolah: document.getElementById('edit-user-sekolah').value,
    tglMulai: document.getElementById('edit-user-mulai').value,
    tglSelesai: document.getElementById('edit-user-selesai').value
  };

  showLoading('Menyimpan perubahan user...');
  const res = await callAppsScript('updateUser', { payload });
  hideLoading();

  showToast(res.message);
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modalEditUser')).hide();
    loadAdminDashboard();
  }
}

function loadJadwalSection() {
  const select = document.getElementById('schedule-user');
  const delSelect = document.getElementById('del-user-select');
  const container = document.getElementById('gen-user-checkboxes');
  if (!select || !container) return;

  select.innerHTML = '';
  if (delSelect) delSelect.innerHTML = '<option value="">-- Semua User / Siswa PKL --</option>';
  container.innerHTML = '';

  if (!activeUserList || activeUserList.length === 0) {
    select.innerHTML = '<option value="">Tidak ada user aktif</option>';
    container.innerHTML = '<small class="text-muted">Tidak ada user aktif</small>';
    return;
  }

  activeUserList.forEach(u => {
    select.innerHTML += `<option value="${u.username}">${u.nama} (@${u.username})</option>`;
    if (delSelect) delSelect.innerHTML += `<option value="${u.username}">${u.nama} (@${u.username})</option>`;
    container.innerHTML += `
      <div class="form-check form-check-sm mb-1">
        <input class="form-check-input gen-user-checkbox" type="checkbox" value="${u.username}" data-nama="${u.nama}" id="chk-${u.username}" checked>
        <label class="form-check-label small" for="chk-${u.username}">${u.nama}</label>
      </div>
    `;
  });
}

function toggleAllUsers(status) {
  const checkboxes = document.querySelectorAll('.gen-user-checkbox');
  checkboxes.forEach(chk => { chk.checked = status; });
}

async function handleCreateSchedule() {
  const userSelect = document.getElementById('schedule-user');
  const scheduleData = {
    username: userSelect.value,
    nama: userSelect.options[userSelect.selectedIndex] ? userSelect.options[userSelect.selectedIndex].text.split(' (')[0] : '',
    tanggal: document.getElementById('schedule-date').value,
    shift: document.getElementById('schedule-shift').value,
    catatan: document.getElementById('schedule-note').value
  };

  if (!scheduleData.tanggal) return showToast("Pilih tanggal kerja!");

  showLoading('Menyimpan jadwal...');
  const res = await callAppsScript('createSchedule', { scheduleData });
  hideLoading();

  showToast(res.message);
  if (res.success) loadAllSchedules();
}

async function handleGenerateRandomSchedule() {
  const startDate = document.getElementById('gen-start-date').value;
  const endDate = document.getElementById('gen-end-date').value;
  const jenisPKL = document.getElementById('gen-jenis-pkl').value;
  const quotaPagi = parseInt(document.getElementById('gen-quota-pagi').value, 10) || 0;
  const quotaSiang = parseInt(document.getElementById('gen-quota-siang').value, 10) || 0;
  
  const checkboxes = document.querySelectorAll('.gen-user-checkbox:checked');
  let users = [];
  checkboxes.forEach(chk => {
    users.push({ 
      username: chk.value, 
      nama: chk.getAttribute('data-nama')
    });
  });

  if (!startDate || !endDate) return showToast("Tentukan tanggal mulai dan selesai!");
  if (startDate > endDate) return showToast("Tanggal mulai tidak boleh melebihi tanggal selesai!");
  if (!users.length) return showToast("Pilih minimal satu user!");
  if (quotaPagi <= 0 && quotaSiang <= 0) return showToast("Masukkan kuota minimal untuk salah satu shift!");

  showLoading('Membagi jadwal shift berdasarkan kuota harian...');
  const res = await callAppsScript('generateRandomSchedule', { 
    payload: { startDate, endDate, users, jenisPKL, quotaPagi, quotaSiang } 
  });
  hideLoading();

  showToast(res.message);
  if (res.success) loadAllSchedules();
}

async function loadAllSchedules() {
  const tbody = document.getElementById('table-all-schedules-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Memuat daftar jadwal...</td></tr>';

  const res = await callAppsScript('getAllSchedules');
  allSchedulesList = res.data || [];

  if (!allSchedulesList.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada jadwal.</td></tr>';
    return;
  }

  tbody.innerHTML = allSchedulesList.map(s => `
    <tr>
      <td><b>${formatIndonesianDate(s.tanggal)}</b></td>
      <td><b>${s.nama}</b></td>
      <td><span class="badge ${s.shift === 'PAGI' ? 'bg-primary' : 'bg-success'}">${s.shift}</span></td>
      <td><small>${s.catatan}</small></td>
      <td class="text-center">
        <button class="btn btn-xs btn-outline-danger" onclick="handleDeleteSchedule(${s.rowIndex})">Hapus</button>
      </td>
    </tr>
  `).join('');
}

async function handleDeleteSchedule(rowIndex) {
  if (!confirm("Hapus jadwal ini?")) return;
  showLoading('Menghapus jadwal...');
  const res = await callAppsScript('deleteSchedule', { rowIndex });
  hideLoading();
  showToast(res.message);
  if (res.success) loadAllSchedules();
}

async function handleDeleteSchedulesByRange() {
  const startDate = document.getElementById('del-start-date').value;
  const endDate = document.getElementById('del-end-date').value;
  const username = document.getElementById('del-user-select').value;

  if (!startDate || !endDate) return showToast("Pilih tanggal mulai dan selesai!");
  if (startDate > endDate) return showToast("Tanggal mulai tidak boleh lebih besar!");

  if (!confirm(`Hapus jadwal dari ${formatIndonesianDate(startDate)} s/d ${formatIndonesianDate(endDate)}?`)) return;

  showLoading('Menghapus jadwal...');
  const res = await callAppsScript('deleteSchedulesByRange', {
    payload: { startDate, endDate, username }
  });
  hideLoading();

  showToast(res.message);
  if (res.success) loadAllSchedules();
}

async function loadAllAttendanceDetails() {
  const tbody = document.getElementById('table-detail-all-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Memuat riwayat...</td></tr>';

  const res = await callAppsScript('getAllAttendanceDetails');
  rawAllDetails = res.data || [];
  applyAttendanceFilters();
}

function applyAttendanceFilters() {
  const search = document.getElementById('filter-search-name').value.toLowerCase();
  const status = document.getElementById('filter-status').value;

  const filtered = rawAllDetails.filter(r => {
    const matchSearch = r.nama.toLowerCase().includes(search) || r.username.toLowerCase().includes(search);
    const matchStatus = status === '' || r.status === status || (status === 'HADIR' && (r.status === 'MASUK' || r.status === 'HADIR'));
    return matchSearch && matchStatus;
  });

  const tbody = document.getElementById('table-detail-all-body');
  if (!tbody) return;

  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ditemukan data.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td><small class="fw-bold text-dark">${formatIndonesianDate(r.tanggal)}</small></td>
      <td><b>${r.nama}</b></td>
      <td>${r.jamMasuk}</td>
      <td>${r.jamPulang}</td>
      <td><span class="badge bg-success">${r.status}</span></td>
      <td><small>${r.keterlambatan}</small></td>
      <td><small>${r.kegiatan || '-'}</small></td>
      <td><small>${r.alasan || '-'}</small></td>
      <td class="no-print text-center">
        <button class="btn btn-xs btn-outline-primary" onclick="openModalEditAttendance(${r.rowIndex}, '${r.jamMasuk}', '${r.jamPulang}', '${r.status}', \`${r.kegiatan || ''}\`, \`${r.alasan || ''}\`)">
          <i class="fa-solid fa-edit"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function openModalEditAttendance(rowIndex, masuk, pulang, status, kegiatan, alasan) {
  document.getElementById('edit-att-rowIndex').value = rowIndex;
  document.getElementById('edit-att-masuk').value = masuk;
  document.getElementById('edit-att-pulang').value = pulang;
  document.getElementById('edit-att-status').value = status;
  document.getElementById('edit-att-kegiatan').value = kegiatan;
  document.getElementById('edit-att-alasan').value = alasan;

  const modal = new bootstrap.Modal(document.getElementById('modalEditAttendance'));
  modal.show();
}

async function saveEditAttendance() {
  const payload = {
    rowIndex: document.getElementById('edit-att-rowIndex').value,
    jamMasuk: document.getElementById('edit-att-masuk').value,
    jamPulang: document.getElementById('edit-att-pulang').value,
    status: document.getElementById('edit-att-status').value,
    kegiatan: document.getElementById('edit-att-kegiatan').value,
    alasan: document.getElementById('edit-att-alasan').value
  };

  showLoading('Menyimpan perubahan riwayat...');
  const res = await callAppsScript('updateAttendanceRecord', { payload });
  hideLoading();

  showToast(res.message);
  if (res.success) {
    bootstrap.Modal.getInstance(document.getElementById('modalEditAttendance')).hide();
    loadAllAttendanceDetails();
  }
}

function exportToExcel() {
  if (!rawAllDetails || !rawAllDetails.length) return showToast("Tidak ada data untuk diexport!");

  const dataToExport = rawAllDetails.map(r => ({
    "Tanggal": formatIndonesianDate(r.tanggal),
    "Username": r.username,
    "Nama Lengkap": r.nama,
    "Jam Masuk": r.jamMasuk,
    "Jam Pulang": r.jamPulang,
    "Status": r.status,
    "Keterlambatan": r.keterlambatan,
    "Laporan Kegiatan": r.kegiatan || "-",
    "Alasan / Keterangan": r.alasan || "-"
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Riwayat Absensi");
  XLSX.writeFile(workbook, "Riwayat_Absensi_PKL.xlsx");
}

async function loadPendingCutiIzin() {
  const tbody = document.getElementById('table-approve-cuti-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Memuat data pengajuan...</td></tr>';

  const res = await callAppsScript('getPendingCutiIzin');
  const data = res.data || [];

  const pendingCount = data.filter(r => r.status === 'PENDING').length;
  const badge = document.getElementById('badge-pending-cuti');
  if (badge) {
    if (pendingCount > 0) {
      badge.innerText = pendingCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada data pengajuan.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(r => {
    let actionButtons = '-';
    if (r.status === 'PENDING') {
      actionButtons = `
        <button class="btn btn-sm btn-success fw-bold me-1" onclick="handleApproveCutiIzin('${r.id}', 'APPROVED')">Approve</button>
        <button class="btn btn-sm btn-danger fw-bold" onclick="handleApproveCutiIzin('${r.id}', 'REJECTED')">Tolak</button>
      `;
    } else {
      actionButtons = `<small class="text-muted">${r.status}</small>`;
    }

    return `
      <tr>
        <td><b>${r.id}</b></td>
        <td><b>${r.nama}</b><br><small class="text-muted">@${r.username}</small></td>
        <td><span class="badge bg-secondary">${r.kategori}</span></td>
        <td><small>${formatIndonesianDate(r.tglMulai)} s/d ${formatIndonesianDate(r.tglSelesai)}</small></td>
        <td><small>${r.alasan}</small></td>
        <td>${r.fileUrl && r.fileUrl !== '-' ? `<a href="${r.fileUrl}" target="_blank" class="btn btn-xs btn-outline-info">View File</a>` : '-'}</td>
        <td><span class="badge ${r.status === 'APPROVED' ? 'bg-success' : r.status === 'REJECTED' ? 'bg-danger' : 'bg-warning text-dark'}">${r.status}</span></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

async function handleApproveCutiIzin(id, targetStatus) {
  showLoading('Memproses approval...');
  const res = await callAppsScript('processCutiIzinApproval', { id, status: targetStatus });
  hideLoading();
  showToast(res.message);
  loadPendingCutiIzin();
  loadAdminDashboard();
}

async function loadPendingUsers() {
  const tbody = document.getElementById('table-approve-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Memuat data user...</td></tr>';

  const res = await callAppsScript('getPendingUsers');
  const data = res.data || [];

  const pendingCount = data.filter(u => u.status === 'PENDING').length;
  const badge = document.getElementById('badge-pending-count');
  if (badge) {
    if (pendingCount > 0) {
      badge.innerText = pendingCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada data pendaftaran user.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => {
    let actionButtons = '-';
    if (u.status === 'PENDING') {
      actionButtons = `
        <button class="btn btn-sm btn-success fw-bold me-1" onclick="handleApproveUser('${u.username}', 'active')">Approve</button>
        <button class="btn btn-sm btn-danger fw-bold" onclick="handleApproveUser('${u.username}', 'rejected')">Tolak</button>
      `;
    } else {
      actionButtons = `<small class="text-muted">${u.status}</small>`;
    }

    return `
      <tr>
        <td><b>${u.nama}</b><br><small class="text-muted">@${u.username}</small></td>
        <td><small>${u.asalSekolah || '-'}</small></td>
        <td><small>${formatIndonesianDate(u.tglMulai)} s/d ${formatIndonesianDate(u.tglSelesai)}</small></td>
        <td><span class="badge ${u.status === 'ACTIVE' ? 'bg-success' : u.status === 'REJECTED' ? 'bg-danger' : 'bg-warning text-dark'}">${u.status}</span></td>
        <td>${actionButtons}</td>
      </tr>
    `;
  }).join('');
}

async function handleApproveUser(username, targetStatus) {
  showLoading('Memproses user...');
  const res = await callAppsScript('processUserApproval', { username, status: targetStatus });
  hideLoading();
  showToast(res.message);
  loadPendingUsers();
  loadAdminDashboard();
}

function initAdminMap() {
  fetchLocationSettings();
  setTimeout(() => {
    const defaultLat = targetLocation && targetLocation.lat !== 0 ? targetLocation.lat : -6.200000;
    const defaultLng = targetLocation && targetLocation.lng !== 0 ? targetLocation.lng : 106.816666;

    document.getElementById('set-lat').value = defaultLat;
    document.getElementById('set-lng').value = defaultLng;

    if (!adminMap) {
      adminMap = L.map('admin-map').setView([defaultLat, defaultLng], 16);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(adminMap);
      adminMarker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(adminMap);

      adminMarker.on('dragend', function(e) {
        const pos = adminMarker.getLatLng();
        document.getElementById('set-lat').value = pos.lat.toFixed(6);
        document.getElementById('set-lng').value = pos.lng.toFixed(6);
      });
    } else {
      adminMap.invalidateSize();
    }
  }, 300);
}

async function handleUpdateLocation() {
  const lat = document.getElementById('set-lat').value;
  const lng = document.getElementById('set-lng').value;

  showLoading('Memperbarui koordinat lokasi...');
  const res = await callAppsScript('updateLocation', { lat, lng });
  hideLoading();
  showToast(res.message);
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function fetchLocationSettings() {
  const res = await callAppsScript('getLocation');
  if (res.success) targetLocation = res.location;
}

function logout() {
  document.body.classList.remove('admin-mode');
  currentUser = null;
  capturedBase64 = "";
  localStorage.removeItem('pkl_current_user');
  document.getElementById('view-user').classList.add('d-none');
  document.getElementById('view-admin').classList.add('d-none');
  document.getElementById('view-auth').classList.remove('d-none');
}

// Muat ulang data ketika tab navigasi admin dibuka, tanpa memuat ulang seluruh halaman.
async function refreshAdminCurrentTab(force = false) {
  const activeTab = document.querySelector('#adminTab .nav-link.active');
  const target = activeTab ? activeTab.getAttribute('data-bs-target') : '#tab-rekap';
  switch (target) {
    case '#tab-rekap':
      await loadAdminDashboard();
      break;
    case '#tab-jadwal':
      await loadAdminDashboard();
      loadJadwalSection();
      if (document.querySelector('#sub-list-jadwal.active, #sub-list-jadwal.show')) await loadAllSchedules();
      break;
    case '#tab-detail-all':
      await loadAllAttendanceDetails();
      break;
    case '#tab-approve-cuti':
      await loadPendingCutiIzin();
      break;
    case '#tab-approve':
      await loadPendingUsers();
      break;
    case '#tab-setting':
      await fetchLocationSettings();
      initAdminMap();
      break;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const adminTabs = document.querySelectorAll('#adminTab [data-bs-toggle="tab"]');
  adminTabs.forEach(tab => {
    tab.addEventListener('shown.bs.tab', () => {
      refreshAdminCurrentTab(true);
    });
  });
});
