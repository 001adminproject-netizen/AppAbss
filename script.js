const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwmMqU6Cv2LuXowZmbe4hingZrYJJ6-puEBDQuYqhbpCa7c5Djr1d6EnUi6DSuc6BVkqQ/exec";

let currentUser = null;
let targetLocation = null;
let capturedBase64 = "";
let rawAllDetails = []; 
let activeUserList = [];
let allSchedulesList = [];

let adminMap = null;
let adminMarker = null;
let adminCircle = null;

setInterval(() => {
  const now = new Date();
  const timeElem = document.getElementById('current-time');
  const dateElem = document.getElementById('current-date');
  if (timeElem) timeElem.innerText = now.toLocaleTimeString('id-ID');
  if (dateElem) dateElem.innerText = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}, 1000);

function showLoading(msg = 'Memproses data...') {
  document.getElementById('loading-text').innerText = msg;
  document.getElementById('loading-overlay').classList.remove('d-none');
}

function hideLoading() {
  document.getElementById('loading-overlay').classList.add('d-none');
}

function switchUserTab(tabName, btnElem) {
  document.querySelectorAll('.mobile-nav-tabs .nav-btn').forEach(b => b.classList.remove('active'));
  btnElem.classList.add('active');

  document.querySelectorAll('.user-tab-pane').forEach(pane => pane.classList.add('d-none'));
  document.getElementById(`user-tab-${tabName}`).classList.remove('d-none');
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
    console.error('API Error:', error);
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
    username: document.getElementById('reg-username').value,
    password: document.getElementById('reg-password').value,
    tglMulai: document.getElementById('reg-mulai').value,
    tglSelesai: document.getElementById('reg-selesai').value,
    jenisPKL: document.getElementById('reg-jenis-pkl').value
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
  document.getElementById('view-user').classList.remove('d-none');
  document.getElementById('user-welcome').innerText = currentUser.nama;
  loadTodayAttendance();
  fetchLocationSettings();
  handleAbsenTypeChange();
}

function handleShiftChange() {
  const shift = document.getElementById('absen-shift').value;
  if (shift === 'SIANG') {
    alert("Shift Siang (12:15): Bebas radius GPS.");
  } else {
    alert("Shift Pagi (08:15): Wajib radius 100m kantor.");
  }
}

function handleAbsenTypeChange() {
  const tipe = document.getElementById('absen-tipe').value;
  const cameraSection = document.getElementById('wrapper-camera-section');
  const groupKegiatan = document.getElementById('group-kegiatan');
  const groupKeterangan = document.getElementById('group-keterangan');
  const groupKeteranganMasuk = document.getElementById('group-keterangan-masuk');

  if (tipe === 'IZIN' || tipe === 'SAKIT') {
    cameraSection.classList.add('d-none');
    groupKegiatan.classList.add('d-none');
    groupKeteranganMasuk.classList.add('d-none');
    groupKeterangan.classList.remove('d-none');
  } else if (tipe === 'PULANG') {
    cameraSection.classList.remove('d-none');
    groupKegiatan.classList.remove('d-none');
    groupKeteranganMasuk.classList.add('d-none');
    groupKeterangan.classList.add('d-none');
  } else {
    cameraSection.classList.remove('d-none');
    groupKegiatan.classList.add('d-none');
    groupKeteranganMasuk.classList.remove('d-none');
    groupKeterangan.classList.add('d-none');
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
  if (tipe === 'IZIN' || tipe === 'SAKIT') {
    detailText = document.getElementById('absen-keterangan').value.trim();
    if (!detailText) {
      hideLoading();
      return alert(`Keterangan alasan ${tipe} wajib diisi!`);
    }
    return executeSubmitAbsen(tipe, shift, detailText);
  }

  const isShiftSiangBebas = (shift === 'SIANG');
  const wajibRadius = !currentUser.bebasLokasi && !isShiftSiangBebas;

  if (wajibRadius && (tipe === 'MASUK' || tipe === 'PULANG')) {
    if (!navigator.geolocation) {
      hideLoading();
      return alert("Browser tidak mendukung GPS.");
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, targetLocation.lat, targetLocation.lng);
        if (dist > 100) {
          hideLoading();
          alert(`Posisi Anda terlalu jauh (${Math.round(dist)}m dari kantor). Radius maksimal 100m.`);
        } else {
          executeSubmitAbsen(tipe, shift, detailText);
        }
      },
      err => {
        hideLoading();
        alert("Gagal membaca GPS. Pastikan Izin Lokasi aktif!");
      }
    );
  } else {
    executeSubmitAbsen(tipe, shift, detailText);
  }
}

async function executeSubmitAbsen(tipe, shift, textDetail) {
  if ((tipe === 'MASUK' || tipe === 'PULANG') && !capturedBase64) {
    hideLoading();
    return alert("Harap ambil foto selfie terlebih dahulu!");
  }

  showLoading('Mengirim data absensi...');

  const payload = {
    username: currentUser.username,
    nama: currentUser.nama,
    tipe: tipe,
    shift: shift,
    kegiatan: tipe === 'PULANG' ? textDetail : '',
    keterangan: (tipe === 'IZIN' || tipe === 'SAKIT' || tipe === 'MASUK') ? textDetail : '',
    fotoDataUrl: capturedBase64
  };

  const res = await callAppsScript('submitAttendance', { payload });
  hideLoading();
  
  alert(res.message);
  
  if (res.success) {
    document.getElementById('absen-kegiatan').value = '';
    document.getElementById('absen-keterangan').value = '';
    document.getElementById('absen-keterangan-masuk').value = '';
    capturedBase64 = "";
    document.getElementById('preview-img').classList.add('d-none');
    document.getElementById('placeholder-box').classList.remove('d-none');
    loadTodayAttendance();
  }
}

async function loadTodayAttendance() {
  const container = document.getElementById('today-records-container');
  const res = await callAppsScript('getTodayAttendance', { username: currentUser.username });
  const records = res.records;

  if (!records) {
    container.innerHTML = `<p class="text-muted small text-center my-2">Belum ada catatan absen hari ini.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="p-2 bg-light rounded-3 border">
      <div class="d-flex justify-content-between align-items-center">
        <span class="badge bg-primary">${records.status}: ${records.jamMasuk}</span>
        <small class="fw-bold text-secondary">${records.keterlambatan}</small>
      </div>
      ${records.jamPulang && records.jamPulang !== '-' ? `<div class="mt-1"><span class="badge bg-dark">PULANG: ${records.jamPulang}</span></div>` : ''}
      <div class="small text-muted mt-1"><b>Ket/Alasan:</b> ${records.alasan !== '-' ? records.alasan : records.kegiatan || '-'}</div>
    </div>
  `;
}

async function loadMyAttendanceHistory() {
  const tbody = document.getElementById('table-my-attendance-body');
  const summary = document.getElementById('my-attendance-summary');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center">Memuat riwayat...</td></tr>';

  const res = await callAppsScript('getMyAttendanceHistory', { username: currentUser.username });
  const rows = res && res.success ? (res.data || []) : [];

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada riwayat absensi.</td></tr>';
    summary.textContent = '';
    return;
  }

  summary.textContent = `Total riwayat: ${rows.length} catatan`;
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${r.tanggal || '-'}</td>
      <td>${r.jamMasuk || '-'}</td>
      <td>${r.jamPulang || '-'}</td>
      <td><span class="badge bg-secondary">${r.status || '-'}</span></td>
      <td>${r.alasan !== '-' ? r.alasan : r.kegiatan || '-'}</td>
    </tr>
  `).join('');
}

async function loadMySchedule() {
  const tbody = document.getElementById('table-my-schedule-body');
  tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Memuat...</td></tr>';

  const res = await callAppsScript('getUserSchedule', { username: currentUser.username });
  const schedules = res.data || [];

  if (schedules.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada jadwal shift.</td></tr>';
    return;
  }

  tbody.innerHTML = schedules.map(s => `
    <tr>
      <td>${s.tanggal}</td>
      <td><span class="badge bg-primary">${s.shift}</span></td>
      <td><small>${s.catatan || '-'}</small></td>
    </tr>
  `).join('');
}

function showAdminView() {
  document.getElementById('view-admin').classList.remove('d-none');
  loadAdminDashboard();
  loadPendingUsers();
  fetchLocationSettings();
}

async function loadAdminDashboard() {
  const tbody = document.getElementById('table-rekap-body');
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Memuat rekapitulasi user active...</td></tr>';

  const res = await callAppsScript('getAdminDashboard');
  activeUserList = res.data || [];

  if (!activeUserList.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Belum ada user/siswa PKL aktif.</td></tr>';
    return;
  }

  tbody.innerHTML = activeUserList.map(u => `
    <tr>
      <td><b>${u.nama}</b><br><small class="text-muted">@${u.username} (${u.jenisPKL === '7_HARI' ? '7 Hari' : '5 Hari'})</small></td>
      <td><small>${u.tglMulai} s/d ${u.tglSelesai}</small></td>
      <td>
        <span class="badge bg-success">M: ${u.summary.masuk}</span>
        <span class="badge bg-warning text-dark">I: ${u.summary.izin}</span>
        <span class="badge bg-danger">S: ${u.summary.sakit}</span>
      </td>
      <td><small>${u.summary.totalTelatMenit > 0 ? u.summary.totalTelatMenit + ' Mnt' : 'Tepat Waktu'}</small></td>
      <td><small class="fw-bold">${u.persentase}%</small></td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="alert('Username: ${u.username}')">Detail</button>
      </td>
    </tr>
  `).join('');
}

function loadJadwalSection() {
  const select = document.getElementById('schedule-user');
  const container = document.getElementById('gen-user-checkboxes');
  if (!select || !container) return;

  select.innerHTML = '';
  container.innerHTML = '';

  if (!activeUserList || activeUserList.length === 0) {
    select.innerHTML = '<option value="">Tidak ada user aktif</option>';
    container.innerHTML = '<small class="text-muted">Tidak ada user aktif</small>';
    return;
  }

  activeUserList.forEach(u => {
    select.innerHTML += `<option value="${u.username}">${u.nama} (@${u.username})</option>`;
    container.innerHTML += `
      <div class="form-check form-check-sm mb-1">
        <input class="form-check-input gen-user-checkbox" type="checkbox" value="${u.username}" data-nama="${u.nama}" data-jenis="${u.jenisPKL}" id="chk-${u.username}" checked>
        <label class="form-check-label small" for="chk-${u.username}">${u.nama} <span class="badge bg-secondary" style="font-size:0.65rem">${u.jenisPKL === '7_HARI' ? '7H' : '5H'}</span></label>
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

  if (!scheduleData.tanggal) return alert("Pilih tanggal kerja!");

  showLoading('Menyimpan jadwal...');
  const res = await callAppsScript('createSchedule', { scheduleData });
  hideLoading();

  alert(res.message);
  if (res.success) loadAllSchedules();
}

async function handleGenerateRandomSchedule() {
  const startDate = document.getElementById('gen-start-date').value;
  const endDate = document.getElementById('gen-end-date').value;
  const quotaPagi = document.getElementById('gen-quota-pagi').value;
  const quotaSiang = document.getElementById('gen-quota-siang').value;
  const filterJenisPKL = document.getElementById('gen-filter-jenis-pkl').value;
  
  const checkboxes = document.querySelectorAll('.gen-user-checkbox:checked');
  let users = [];
  checkboxes.forEach(chk => {
    users.push({ 
      username: chk.value, 
      nama: chk.getAttribute('data-nama'),
      jenisPKL: chk.getAttribute('data-jenis')
    });
  });

  if (!startDate || !endDate) return alert("Tentukan tanggal mulai dan selesai!");
  if (startDate > endDate) return alert("Tanggal mulai tidak boleh melebihi tanggal selesai!");
  if (!users.length) return alert("Pilih minimal satu user!");

  showLoading('Mengacak dan membagi jadwal shift secara adil...');
  const res = await callAppsScript('generateRandomSchedule', { 
    payload: { 
      startDate, 
      endDate, 
      users,
      quotaPagi,
      quotaSiang,
      filterJenisPKL
    } 
  });
  hideLoading();

  alert(res.message);
  if (res.success) loadAllSchedules();
}

async function loadAllSchedules() {
  const tbody = document.getElementById('table-all-schedules-body');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Memuat daftar jadwal...</td></tr>';

  const res = await callAppsScript('getAllSchedules');
  allSchedulesList = res.data || [];

  if (!allSchedulesList.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada jadwal.</td></tr>';
    return;
  }

  tbody.innerHTML = allSchedulesList.map(s => `
    <tr>
      <td>${s.tanggal}</td>
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
  alert(res.message);
  if (res.success) loadAllSchedules();
}

async function loadAllAttendanceDetails() {
  const tbody = document.getElementById('table-detail-all-body');
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Memuat riwayat...</td></tr>';

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
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Tidak ditemukan data.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.tanggal}</td>
      <td><b>${r.nama}</b></td>
      <td>${r.jamMasuk}</td>
      <td>${r.jamPulang}</td>
      <td><span class="badge bg-success">${r.status}</span></td>
      <td><small>${r.alasan}</small></td>
      <td><small>${r.keterlambatan}</small></td>
    </tr>
  `).join('');
}

async function loadPendingUsers() {
  const tbody = document.getElementById('table-approve-body');
  tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Memuat antrean...</td></tr>';

  const res = await callAppsScript('getPendingUsers');
  const data = res.data || [];

  const badge = document.getElementById('badge-pending-count');
  if (data.length > 0) {
    badge.innerText = data.length;
    badge.classList.remove('d-none');
  } else {
    badge.classList.add('d-none');
  }

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Tidak ada pendaftaran pending.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(u => `
    <tr>
      <td><b>${u.nama}</b><br><small class="text-muted">@${u.username}</small></td>
      <td><small>${u.tglMulai} s/d ${u.tglSelesai}</small></td>
      <td>${u.totalHari} Hari</td>
      <td>
        <button class="btn btn-sm btn-success fw-bold me-1" onclick="handleApproveUser('${u.username}', 'active')">Approve</button>
        <button class="btn btn-sm btn-danger fw-bold" onclick="handleApproveUser('${u.username}', 'rejected')">Tolak</button>
      </td>
    </tr>
  `).join('');
}

async function handleApproveUser(username, targetStatus) {
  showLoading('Memproses approval...');
  const res = await callAppsScript('processUserApproval', { username, status: targetStatus });
  hideLoading();
  alert(res.message);
  loadPendingUsers();
  loadAdminDashboard();
}

async function handleAddUser() {
  const userData = {
    username: document.getElementById('add-username').value,
    password: document.getElementById('add-password').value,
    nama: document.getElementById('add-nama').value,
    role: document.getElementById('add-role').value,
    jenisPKL: document.getElementById('add-jenis-pkl').value,
    tglMulai: document.getElementById('add-mulai').value,
    tglSelesai: document.getElementById('add-selesai').value
  };

  if (!userData.username || !userData.password) return alert("Username dan Password wajib diisi!");

  showLoading('Menambahkan user...');
  const res = await callAppsScript('addUser', { userData });
  hideLoading();

  alert(res.message);
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
      adminCircle = L.circle([defaultLat, defaultLng], { radius: 100, color: 'blue' }).addTo(adminMap);

      adminMarker.on('dragend', function(e) {
        const pos = adminMarker.getLatLng();
        document.getElementById('set-lat').value = pos.lat.toFixed(6);
        document.getElementById('set-lng').value = pos.lng.toFixed(6);
        adminCircle.setLatLng(pos);
      });
    } else {
      adminMap.invalidateSize();
    }
  }, 300);
}

async function handleUpdateLocation() {
  const lat = document.getElementById('set-lat').value;
  const lng = document.getElementById('set-lng').value;

  showLoading('Memperbarui koordinat...');
  const res = await callAppsScript('updateLocation', { lat, lng });
  hideLoading();
  alert(res.message);
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
  currentUser = null;
  capturedBase64 = "";
  document.getElementById('view-user').classList.add('d-none');
  document.getElementById('view-admin').classList.add('d-none');
  document.getElementById('view-auth').classList.remove('d-none');
}