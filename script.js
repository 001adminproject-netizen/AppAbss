let ABSENSI_HOLIDAYS = [];
let ABSENSI_HOLIDAY_ROWS = [];
let ADMIN_HOLIDAY_ROWS = [];
async function loadHolidayCalendar() {
  try {
    const res = await callAppsScript('getHolidayCalendar');
    if (res && res.success && Array.isArray(res.data)) {
      ABSENSI_HOLIDAY_ROWS = res.data;
      ABSENSI_HOLIDAYS = res.data.filter(x => x.isHoliday).map(x => x.date);
      const status = document.getElementById('holiday-sync-status');
      if (status) status.textContent = `${ABSENSI_HOLIDAYS.length} tanggal libur aktif tersimpan di kalender.`;
    }
  } catch (e) { console.warn('Kalender libur memakai data lokal terakhir.', e); }
}

function isWeekendOrHolidayToday() {
  const now=new Date();
  const day=now.getDay();
  const key=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  return day===0||day===6||ABSENSI_HOLIDAYS.includes(key);
}


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

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwp8gZYLXN-am2xebNhvxA5WcBVpWAEWu5HCep2FTJJ1eThqChQLdpnw7qfvnMj8R7WCw/exec";

let currentUser = null;
let targetLocation = null;
let capturedBase64 = "";
let rawAllDetails = []; 
let activeUserList = [];
let allSchedulesList = [];
let scheduleCalendarCursor = new Date();

let adminMap = null;
let adminMarker = null;

document.addEventListener("DOMContentLoaded", async () => {
  const savedUser = localStorage.getItem('pkl_current_user');
  if (savedUser) {
    try {
      currentUser = JSON.parse(savedUser);
      document.getElementById('view-auth').classList.add('d-none');
      await loadHolidayCalendar();
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


async function loadAdminHolidayCalendar() {
  const body = document.getElementById('admin-holiday-calendar-body');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Memuat kalender...</td></tr>';
  const res = await callAppsScript('getHolidayCalendar');
  if (!res || !res.success || !Array.isArray(res.data)) {
    body.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat kalender libur.</td></tr>';
    return;
  }
  ADMIN_HOLIDAY_ROWS = res.data.slice().sort((a,b) => a.date.localeCompare(b.date));
  const yearSelect = document.getElementById('admin-holiday-year');
  if (yearSelect) {
    const old = yearSelect.value;
    const years = [...new Set(ADMIN_HOLIDAY_ROWS.map(r => String(r.date).slice(0,4)))].sort();
    yearSelect.innerHTML = '<option value="">Semua Tahun</option>' + years.map(y => `<option value="${y}">${y}</option>`).join('');
    if (years.includes(old)) yearSelect.value = old;
  }
  const status = document.getElementById('admin-holiday-calendar-status');
  if (status) status.textContent = `${ADMIN_HOLIDAY_ROWS.length} tanggal terdaftar di kalender.`;
  renderAdminHolidayCalendarTable();
}

function renderAdminHolidayCalendarTable() {
  const body = document.getElementById('admin-holiday-calendar-body');
  if (!body) return;
  const year = document.getElementById('admin-holiday-year')?.value || '';
  const rows = ADMIN_HOLIDAY_ROWS.filter(r => !year || String(r.date).startsWith(year));
  if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Belum ada data kalender.</td></tr>'; return; }
  body.innerHTML = rows.map((r, i) => `<tr>
    <td>${i+1}</td><td class="text-nowrap">${formatIndonesianDate(r.date)}</td><td>${escapeHtml(r.name || '-')}</td>
    <td><span class="badge ${String(r.type).toLowerCase().includes('nasional') ? 'bg-danger' : 'bg-warning text-dark'}">${escapeHtml(r.type || '-')}</span></td>
    <td><select class="form-select form-select-sm" id="holiday-policy-${String(r.date).replace(/[^0-9]/g,'')}" style="min-width:170px">
      <option value="true" ${r.isHoliday ? 'selected' : ''}>Libur — absensi tidak wajib</option>
      <option value="false" ${!r.isHoliday ? 'selected' : ''}>Hari kerja — absensi normal</option>
    </select></td>
    <td>Kalender otomatis</td>
    <td><button type="button" class="btn btn-sm btn-primary" onclick="saveAdminHolidayPolicy('${String(r.date)}')"><i class="fa-solid fa-floppy-disk me-1"></i> Simpan</button></td>
  </tr>`).join('');
}
window.loadAdminHolidayCalendar = loadAdminHolidayCalendar;
window.renderAdminHolidayCalendarTable = renderAdminHolidayCalendarTable;

async function saveAdminHolidayPolicy(date) {
  if (!currentUser || currentUser.role !== 'admin') return showToast('Akses hanya untuk admin.', 'error');
  const id = 'holiday-policy-' + String(date).replace(/[^0-9]/g, '');
  const select = document.getElementById(id);
  if (!select) return showToast('Kontrol perlakuan absensi tidak ditemukan.', 'error');
  showLoading('Menyimpan perlakuan absensi...');
  const res = await callAppsScript('updateHolidayPolicy', {
    username: currentUser.username, date: date, isHoliday: select.value === 'true'
  });
  hideLoading();
  showToast(res.message || (res.success ? 'Perlakuan absensi berhasil disimpan.' : 'Gagal menyimpan.'), res.success ? 'success' : 'error');
  if (res.success) {
    const row = ADMIN_HOLIDAY_ROWS.find(x => x.date === date);
    if (row) row.isHoliday = select.value === 'true';
    renderAdminHolidayCalendarTable();
    await loadHolidayCalendar();
  }
}
window.saveAdminHolidayPolicy = saveAdminHolidayPolicy;

async function syncHolidayCalendarNow() {
  if (!currentUser || currentUser.role !== 'admin') return showToast('Akses hanya untuk admin.', 'error');
  showLoading('Menyinkronkan kalender libur...');
  const res = await callAppsScript('syncHolidayCalendar', { username: currentUser.username });
  if (res.success) await loadHolidayCalendar();
  hideLoading();
  showToast(res.message || (res.success ? 'Kalender berhasil diperbarui.' : 'Sinkronisasi gagal.'), res.success ? 'success' : 'error');
  return res;
}
window.syncHolidayCalendarNow = syncHolidayCalendarNow;

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
  const navKey = targetPage === 'cuti-izin' ? 'izin' : targetPage;
  const activeBtn = document.getElementById(`btn-nav-${navKey}`);

  document.querySelectorAll('.mobile-nav-tabs .nav-btn').forEach(b => b.classList.remove('active'));
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('.user-page-section').forEach(sec => sec.classList.add('d-none'));

  const targetSec = document.getElementById(`page-user-${targetPage}`);
  if (targetSec) {
    targetSec.classList.remove('d-none');
  }

  if (targetPage === 'absen') setupAbsenModeOptions();
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
    case 'jadwal-libur':
      loadMyJadwalLibur();
      break;
    case 'riwayat':
      loadMyAttendanceHistory();
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
    await loadHolidayCalendar();

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

const TIPE_KERJA_UI = {
  STAY_OFFICE:   { label: 'Stay Office',   modes: ['PAGI'] },
  SHIFT_WORK:    { label: 'Shift Work',    modes: ['PAGI', 'SIANG', 'WFH_PAGI', 'WFH_SIANG'] },
  FLEXIBEL_WORK: { label: 'Flexibel Work', modes: ['PAGI'] }
};
const MODE_UI = {
  PAGI:      'SHIFT PAGI (08:15 - 16:00)',
  SIANG:     'SHIFT SIANG (13:15 - 20:00)',
  WFH_PAGI:  'WFH PAGI (08:15 - 16:00)',
  WFH_SIANG: 'WFH SIANG (13:15 - 20:00)'
};

function getUserTipeKerja() {
  if (!currentUser) return 'STAY_OFFICE';
  const v = String(currentUser.tipeKerja || '').toUpperCase();
  if (TIPE_KERJA_UI[v]) return v;
  return currentUser.bebasLokasi ? 'FLEXIBEL_WORK' : 'STAY_OFFICE';
}

function isRadiusRequiredFor(mode) {
  const tipeKerja = getUserTipeKerja();
  if (mode !== 'PAGI' || tipeKerja === 'FLEXIBEL_WORK') return false;
  // Hanya SHIFT PAGI Stay Office/Shift Work pada Senin-Jumat yang wajib radius.
  const day = new Date().getDay();
  return day >= 1 && day <= 5 && !isWeekendOrHolidayToday();
}

function setupAbsenModeOptions() {
  const sel = document.getElementById('absen-shift');
  if (!sel || !currentUser) return;
  const tipe = getUserTipeKerja();
  const day = new Date().getDay();
  const key = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const isNationalHoliday = ABSENSI_HOLIDAYS.includes(key);
  let modes = [...TIPE_KERJA_UI[tipe].modes];

  // Shift Work pada Sabtu, Minggu, dan tanggal merah hanya boleh WFH.
  if (tipe === 'SHIFT_WORK' && (day === 0 || day === 6 || isNationalHoliday)) {
    modes = ['WFH_PAGI', 'WFH_SIANG'];
  }

  const prev = sel.value;
  sel.innerHTML = modes.map(m => `<option value="${m}">${MODE_UI[m]}</option>`).join('');
  if (modes.includes(prev)) sel.value = prev;
  const info = document.getElementById('absen-tipe-info');
  let note = '';
  if (tipe === 'STAY_OFFICE' && day === 6) note = 'Sabtu: absen PAGI bersifat opsional dan jam pulang 12:00.';
  else if (tipe === 'SHIFT_WORK' && (day === 0 || day === 6 || isNationalHoliday)) note = 'Hari nonkerja: hanya WFH PAGI atau WFH SIANG; keduanya bebas radius.';
  else if (tipe === 'FLEXIBEL_WORK') note = 'Hanya SHIFT PAGI; bebas lokasi dan tanpa radius.';
  if (info) info.innerHTML = `<b>Tipe kerja:</b> ${TIPE_KERJA_UI[tipe].label}${note ? `<br><small>${note}</small>` : ''}`;
}
function handleShiftChange() {
  const mode = document.getElementById('absen-shift').value;
  const tipe = getUserTipeKerja();
  const day = new Date().getDay();
  const key = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-${String(new Date().getDate()).padStart(2,'0')}`;
  const isNationalHoliday = ABSENSI_HOLIDAYS.includes(key);

  if (mode === 'WFH_PAGI' || mode === 'WFH_SIANG') {
    showToast('Mode WFH: bebas lokasi dan tanpa radius GPS.', 'info');
  } else if (mode === 'SIANG') {
    showToast('SHIFT SIANG: bebas lokasi dan tanpa radius GPS.', 'info');
  } else if (tipe === 'FLEXIBEL_WORK') {
    showToast('Flexible Work: hanya SHIFT PAGI, bebas lokasi dan tanpa radius.', 'info');
  } else if (tipe === 'STAY_OFFICE' && day === 6) {
    showToast('Sabtu: absen PAGI boleh dilakukan. Jika masuk, jam pulang otomatis 12:00.', 'info');
  } else if (day === 0 || isNationalHoliday) {
    showToast('Mode ini tidak tersedia pada hari Minggu atau tanggal merah.', 'error');
  } else {
    showToast('SHIFT PAGI: wajib berada dalam radius 100 meter dari kantor.', 'info');
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

  const tipeKerja = getUserTipeKerja();
  const today = new Date();
  const day = today.getDay();
  const dateKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const isNationalHoliday = ABSENSI_HOLIDAYS.includes(dateKey);

  if (tipeKerja === 'STAY_OFFICE' && (day === 0 || isNationalHoliday)) {
    return showToast('Stay Office tidak dapat melakukan absensi pada hari Minggu atau tanggal merah.', 'error');
  }
  if (tipeKerja === 'SHIFT_WORK' && (day === 0 || day === 6 || isNationalHoliday) && !['WFH_PAGI', 'WFH_SIANG'].includes(shift)) {
    return showToast('Pada Sabtu, Minggu, atau tanggal merah, Shift Work hanya boleh memilih WFH PAGI atau WFH SIANG.', 'error');
  }

  showLoading('Mengecek lokasi & presensi...');

  let detailText = "";
  if (tipe === 'MASUK') detailText = document.getElementById('absen-keterangan-masuk').value.trim();
  if (tipe === 'PULANG') detailText = document.getElementById('absen-kegiatan').value.trim();

  const wajibRadius = isRadiusRequiredFor(shift);

  if (wajibRadius && (tipe === 'MASUK' || tipe === 'PULANG')) {
    if (!navigator.geolocation) {
      hideLoading();
      return showToast("Browser tidak mendukung GPS.");
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!targetLocation || !targetLocation.lat) {
          executeSubmitAbsen(tipe, shift, detailText, coords);
          return;
        }
        const dist = calculateDistance(coords.lat, coords.lng, targetLocation.lat, targetLocation.lng);
        if (dist > 100) {
          hideLoading();
          showToast(`Posisi Anda terlalu jauh (${Math.round(dist)}m dari kantor). Radius maksimal 100m.`);
        } else {
          executeSubmitAbsen(tipe, shift, detailText, coords);
        }
      },
      err => {
        hideLoading();
        showToast("Gagal membaca GPS. Pastikan Izin Lokasi aktif!");
      }
    );
  } else {
    executeSubmitAbsen(tipe, shift, detailText, null);
  }
}

async function executeSubmitAbsen(tipe, shift, textDetail, coords) {
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
    fotoDataUrl: capturedBase64,
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null
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


function getCurrentJadwalLiburMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
  return {
    min: `${year}-${month}-01`,
    max: `${year}-${month}-${String(lastDay).padStart(2, '0')}`
  };
}

let selectedJadwalLiburDates = new Set();

function formatJadwalLiburKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function renderJadwalLiburCalendar() {
  const daysHost = document.getElementById('jadwal-libur-calendar-days');
  const monthLabel = document.getElementById('jadwal-libur-calendar-month');
  if (!daysHost || !monthLabel) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  monthLabel.textContent = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(now);
  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7; // Senin sebagai kolom pertama
  const lastDate = new Date(year, month + 1, 0).getDate();
  const todayKey = formatJadwalLiburKey(now);
  let html = '';
  for (let i = 0; i < offset; i++) html += '<button type="button" class="holiday-calendar-day" disabled aria-hidden="true"></button>';
  for (let day = 1; day <= lastDate; day++) {
    const date = new Date(year, month, day);
    const key = formatJadwalLiburKey(date);
    const selected = selectedJadwalLiburDates.has(key);
    const holidayInfo = ABSENSI_HOLIDAY_ROWS.find(x => x.date === key && x.isHoliday);
    const isNational = !!holidayInfo && String(holidayInfo.type || '').toLowerCase().includes('nasional');
    const classes = ['holiday-calendar-day', selected ? 'is-selected' : '', key === todayKey ? 'is-today' : '', isNational ? 'is-national-holiday' : ''].filter(Boolean).join(' ');
    const title = holidayInfo ? `${holidayInfo.name || 'Hari libur'} — tetap dapat dipilih` : 'Pilih tanggal libur';
    html += `<button type="button" class="${classes}" title="${escapeHtml(title)}" aria-label="${day}${holidayInfo ? ', ' + escapeHtml(holidayInfo.name || 'hari libur nasional') : ''}" data-date="${key}" aria-pressed="${selected}" onclick="toggleJadwalLiburDate('${key}')">${day}</button>`;
  }
  daysHost.innerHTML = html;
  updateJadwalLiburDateCount();
}

function updateJadwalLiburDateCount() {
  const dates = [...selectedJadwalLiburDates].sort();
  const count = document.getElementById('jadwal-libur-date-count');
  const chips = document.getElementById('jadwal-libur-selected-list');
  if (count) count.textContent = `${dates.length} tanggal dipilih`;
  if (chips) chips.innerHTML = dates.map(date => `<span class="holiday-selected-chip">${formatIndonesianDate(date)}</span>`).join('');
}

function toggleJadwalLiburDate(date) {
  const range = getCurrentJadwalLiburMonthRange();
  if (date < range.min || date > range.max) return;
  if (selectedJadwalLiburDates.has(date)) selectedJadwalLiburDates.delete(date);
  else selectedJadwalLiburDates.add(date);
  renderJadwalLiburCalendar();
}

function resetJadwalLiburCalendar() {
  selectedJadwalLiburDates = new Set();
  renderJadwalLiburCalendar();
}

async function handleSubmitJadwalLibur() {
  if (!currentUser) return;
  const tanggal = [...selectedJadwalLiburDates].sort();
  const alasan = document.getElementById('jadwal-libur-alasan').value.trim();

  if (!tanggal.length) {
    return showToast('Pilih minimal satu tanggal pada kalender.', 'error');
  }

  const range = getCurrentJadwalLiburMonthRange();
  if (tanggal.some(date => date < range.min || date > range.max)) {
    return showToast('Tanggal libur hanya boleh dipilih pada bulan berjalan.', 'error');
  }

  showLoading(`Menyimpan ${tanggal.length} jadwal libur...`);
  const res = await callAppsScript('submitJadwalLibur', {
    payload: { username: currentUser.username, nama: currentUser.nama, tanggal, alasan }
  });
  hideLoading();
  showToast(res.message, res.success ? 'success' : 'error');

  if (res.success) {
    resetJadwalLiburCalendar();
    document.getElementById('jadwal-libur-alasan').value = '';
    loadMyJadwalLibur();
  }
}
async function loadMyJadwalLibur() {
  const tbody=document.getElementById('table-my-libur'); if(!tbody||!currentUser)return;
  renderJadwalLiburCalendar();
  const res=await callAppsScript('getMyJadwalLibur',{username:currentUser.username});
  const rows=res.data||[];
  if(!rows.length){tbody.innerHTML='<tr><td colspan="3" class="text-center text-muted">Belum ada jadwal libur.</td></tr>';return;}
  tbody.innerHTML=rows.map(r=>`<tr><td>${formatIndonesianDate(r.tanggal)}</td><td>${r.alasan||'-'}</td><td><span class="badge bg-success">${r.status}</span></td></tr>`).join('');
}

async function loadAdminJadwalLibur() {
  const tbody = document.getElementById('table-admin-jadwal-libur');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">Memuat jadwal libur...</td></tr>';
  const res = await callAppsScript('getAllJadwalLibur');
  const rows = (res && res.success && Array.isArray(res.data)) ? res.data : [];
  const count = document.getElementById('admin-libur-count');
  if (count) count.textContent = rows.length;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Belum ada jadwal libur yang diinput.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((r, i) => `<tr>
    <td>${i + 1}</td><td><b>${escapeHtml(r.nama)}</b><small class="text-muted d-block">@${escapeHtml(r.username)}</small></td>
    <td>${formatIndonesianDate(r.tanggal)}</td><td>${escapeHtml(r.alasan || '-')}</td>
    <td><span class="badge bg-success">${escapeHtml(r.status || 'APPROVED')}</span></td><td><small>${escapeHtml(r.id || '-')}</small></td>
  </tr>`).join('');
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
  tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3">Memuat rekapitulasi...</td></tr>';
  const res = await callAppsScript('getAdminDashboard');
  if (!res || !res.success) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">${(res && res.message) || 'Gagal memuat data.'}</td></tr>`;
    return;
  }
  activeUserList = res.data || [];
  const totals = activeUserList.reduce((a,u) => {
    const s=u.summary||{};
    a.masuk += Number(s.masuk||0); a.izin += Number(s.izin||0)+Number(s.sakit||0);
    a.late += Number(s.terlambat||0);
    a.notCheckout += Number(s.belumPulang||0); return a;
  },{masuk:0,izin:0,late:0,schedules:0,notCheckout:0});
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('admin-stat-users',activeUserList.length); set('admin-stat-masuk',totals.masuk);
  set('admin-stat-izin',totals.izin); set('admin-stat-late',totals.late);
  set('admin-stat-schedules','…'); set('admin-stat-not-checkout',totals.notCheckout);
  const liburSummary = await callAppsScript('getAllJadwalLibur');
  if (liburSummary && liburSummary.success) set('admin-stat-schedules',(liburSummary.data || []).length);
  const updated=document.getElementById('admin-last-updated');
  if(updated)updated.textContent='Diperbarui '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
  renderActiveSummary();
  renderAdminInsights();
  // keep selectors for schedule creator/list in sync
  if (typeof loadJadwalSection === 'function') loadJadwalSection();
}

function renderAdminInsights(){
  const list=activeUserList||[];
  const ranking=[...list].filter(u=>Number(u.summary?.terlambat||0)>0).sort((a,b)=>Number(b.summary?.terlambat||0)-Number(a.summary?.terlambat||0)).slice(0,5);
  const rank=document.getElementById('admin-discipline-ranking');
  if(rank)rank.innerHTML=ranking.length?ranking.map((u,i)=>`<div class="d-flex justify-content-between align-items-center border-bottom py-2"><span><b>${i+1}. ${escapeHtml(u.nama||u.username)}</b><small class="text-muted d-block">${escapeHtml(u.asalSekolah||'')}</small></span><span class="badge bg-warning text-dark">${Number(u.summary?.terlambat||0)} kali · ${Number(u.summary?.totalTelatMenit||0)} menit</span></div>`).join(''):'Belum ada keterlambatan tercatat pada data peserta.';
  const alerts=[];
  list.forEach(u=>{const s=u.summary||{};if(Number(s.belumPulang||0)>0)alerts.push(`${u.nama||u.username}: ${s.belumPulang} absensi belum pulang`);});
  const box=document.getElementById('admin-action-alerts');
  if(box)box.innerHTML=alerts.length?`<div class="alert alert-warning py-2 px-3 mb-0"><b>${alerts.length} peserta perlu diperiksa</b><ul class="mb-0 mt-1 ps-3">${alerts.slice(0,6).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>${alerts.length>6?`<small>+${alerts.length-6} peserta lainnya</small>`:''}</div>`:'<div class="alert alert-success py-2 px-3 mb-0">Tidak ada absensi yang terdeteksi belum pulang dari ringkasan data.</div>';
}

function renderActiveSummary() {
  const tbody=document.getElementById('table-rekap-body');
  if(!tbody)return;
  const q=(document.getElementById('active-search')?.value||'').toLowerCase().trim();
  const period=document.getElementById('active-period-filter')?.value||'';
  const today=getLocalTodayISO();
  const rows=(activeUserList||[]).filter(u=>{
    const hay=[u.nama,u.username,u.asalSekolah].join(' ').toLowerCase();
    const ongoing=(!u.tglMulai||u.tglMulai==='-'||today>=u.tglMulai)&&(!u.tglSelesai||u.tglSelesai==='-'||today<=u.tglSelesai);
    return (!q||hay.includes(q))&&(!period||(period==='berjalan'?ongoing:!ongoing));
  });
  if(!rows.length){tbody.innerHTML='<tr><td colspan="7" class="text-center text-muted py-3">Tidak ada peserta yang cocok dengan filter.</td></tr>';return;}
  tbody.innerHTML=rows.map(u=>{
    const s=u.summary||{};
    const ongoing=(!u.tglMulai||u.tglMulai==='-'||today>=u.tglMulai)&&(!u.tglSelesai||u.tglSelesai==='-'||today<=u.tglSelesai);
    return `<tr>
      <td><b>${u.nama||'-'}</b><br><small class="text-muted">@${u.username||'-'}</small></td>
      <td><small>${u.asalSekolah||'-'}</small></td>
      <td><small>${formatIndonesianDate(u.tglMulai)} s/d ${formatIndonesianDate(u.tglSelesai)}</small><br><small class="text-muted">${u.jenisPKL||'-'}</small></td>
      <td>${({SHIFT_WORK:'<span class="badge bg-success">Shift Work</span>',FLEXIBEL_WORK:'<span class="badge bg-info text-dark">Flexibel Work</span>'})[u.tipeKerja]||'<span class="badge bg-secondary">Stay Office</span>'}</td>
      <td>
        <span class="badge bg-success">Hadir ${s.masuk||0}</span>
        <span class="badge bg-warning text-dark">Izin ${s.izin||0}</span>
        <span class="badge bg-danger">Sakit ${s.sakit||0}</span>
        <span class="badge bg-secondary">Cuti ${s.cuti||0}</span>
        <div class="small text-muted mt-1">Terlambat: ${s.terlambat||0} kali · Pulang lengkap: ${s.pulang||0} · Belum pulang: ${s.belumPulang||0}</div>
      </td>
      <td><span class="badge ${ongoing?'bg-success':'bg-secondary'}">${ongoing?'BERJALAN':'SELESAI'}</span><br><small class="text-muted">${u.totalJadwal||0} jadwal</small></td>
      <td class="text-center"><button class="btn btn-sm btn-outline-primary" onclick="openModalEditUser('${u.username}', '${String(u.nama||'').replace(/'/g,"&#39;")}', '${String(u.asalSekolah||'').replace(/'/g,"&#39;")}', '${u.tglMulai}', '${u.tglSelesai}', '${u.tipeKerja||(u.bebasLokasi?'FLEXIBEL_WORK':'STAY_OFFICE')}')"><i class="fa-solid fa-edit"></i> Edit</button></td>
    </tr>`;
  }).join('');
}

function exportActiveSummary() {
  const rows=activeUserList||[];
  const headers=['Username','Nama','Asal Sekolah','Tanggal Mulai','Tanggal Selesai','Jenis PKL','Total Jadwal','Hadir','Izin','Sakit','Cuti','Terlambat','Total Menit Telat','Pulang Lengkap','Belum Pulang'];
  const data=rows.map(u=>{const s=u.summary||{};return [u.username,u.nama,u.asalSekolah,u.tglMulai,u.tglSelesai,u.jenisPKL,u.totalJadwal||0,s.masuk||0,s.izin||0,s.sakit||0,s.cuti||0,s.terlambat||0,s.totalTelatMenit||0,s.pulang||0,s.belumPulang||0];});
  const csv=[headers,...data].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Rekap_Active_'+getLocalTodayISO()+'.csv';a.click();URL.revokeObjectURL(a.href);
}

function openModalEditUser(username, nama, asalSekolah, tglMulai, tglSelesai, tipeKerja = 'STAY_OFFICE') {
  document.getElementById('edit-user-username').value = username;
  document.getElementById('edit-user-nama').value = nama;
  document.getElementById('edit-user-sekolah').value = asalSekolah !== 'null' ? asalSekolah : '';
  document.getElementById('edit-user-mulai').value = tglMulai;
  document.getElementById('edit-user-selesai').value = tglSelesai;
  const tipeEl = document.getElementById('edit-user-tipe-kerja');
  if (tipeEl) tipeEl.value = tipeKerja;

  const modal = new bootstrap.Modal(document.getElementById('modalEditUser'));
  modal.show();
}

async function saveEditUser() {
  const tipeEl = document.getElementById('edit-user-tipe-kerja');
  const payload = {
    username: document.getElementById('edit-user-username').value,
    nama: document.getElementById('edit-user-nama').value,
    asalSekolah: document.getElementById('edit-user-sekolah').value,
    tglMulai: document.getElementById('edit-user-mulai').value,
    tglSelesai: document.getElementById('edit-user-selesai').value,
    tipeKerja: tipeEl ? tipeEl.value : 'STAY_OFFICE'
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
  const select=document.getElementById('schedule-user'), delSelect=document.getElementById('del-user-select');
  const container=document.getElementById('gen-user-checkboxes'), filterSelect=document.getElementById('schedule-filter-user');
  if(!select||!container)return;
  select.innerHTML=''; if(delSelect)delSelect.innerHTML='<option value="">-- Semua User / Siswa PKL --</option>';
  if(filterSelect)filterSelect.innerHTML='<option value="">Semua peserta</option>';
  container.innerHTML='';
  if(!activeUserList||!activeUserList.length){select.innerHTML='<option value="">Tidak ada user aktif</option>';container.innerHTML='<small class="text-muted">Tidak ada user aktif</small>';return;}
  activeUserList.forEach(u=>{
    const label=`${u.nama} (@${u.username})`;
    select.add(new Option(label,u.username));
    if(delSelect)delSelect.add(new Option(label,u.username));
    if(filterSelect)filterSelect.add(new Option(label,u.username));
    const div=document.createElement('div');div.className='form-check form-check-sm mb-1';
    const input=document.createElement('input');input.className='form-check-input gen-user-checkbox';input.type='checkbox';input.value=u.username;input.dataset.nama=u.nama;input.id='chk-'+u.username;input.checked=true;
    const lab=document.createElement('label');lab.className='form-check-label small';lab.htmlFor=input.id;lab.textContent=u.nama;
    div.append(input,lab);container.appendChild(div);
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

  const offDays = Array.from(document.querySelectorAll('.gen-off-day:checked')).map(el => Number(el.value));
  const rawOffDates = (document.getElementById('gen-off-dates')?.value || '').trim();
  const offDates = rawOffDates ? rawOffDates.split(',').map(s => s.trim()).filter(Boolean) : [];

  showLoading('Membagi jadwal shift berdasarkan kuota harian...');
  const res = await callAppsScript('generateRandomSchedule', { 
    payload: { startDate, endDate, users, jenisPKL, quotaPagi, quotaSiang, offDays, offDates } 
  });
  hideLoading();

  showToast(res.message);
  if (res.success) loadAllSchedules();
}

async function loadAllSchedules() {
  const tbody=document.getElementById('table-all-schedules-body');if(!tbody)return;
  tbody.innerHTML='<tr><td colspan="5" class="text-center text-muted">Memuat daftar jadwal...</td></tr>';
  const res=await callAppsScript('getAllSchedules');
  if(!res||!res.success){tbody.innerHTML='<tr><td colspan="5" class="text-danger text-center">Gagal memuat jadwal.</td></tr>';return;}
  allSchedulesList=res.data||[];
  renderScheduleList();
  renderScheduleCalendar();
}

function renderScheduleList() {
  const tbody=document.getElementById('table-all-schedules-body');if(!tbody)return;
  const date=document.getElementById('schedule-filter-date')?.value||'';
  const user=document.getElementById('schedule-filter-user')?.value||'';
  const shift=document.getElementById('schedule-filter-shift')?.value||'';
  const q=(document.getElementById('schedule-filter-search')?.value||'').toLowerCase().trim();
  const rows=(allSchedulesList||[]).filter(s=>(!date||s.tanggal===date)&&(!user||s.username===user)&&(!shift||s.shift===shift)&&(!q||String(s.nama||'').toLowerCase().includes(q)||String(s.username||'').toLowerCase().includes(q)));
  const summary=document.getElementById('schedule-list-summary');if(summary)summary.textContent=`Menampilkan ${rows.length} dari ${(allSchedulesList||[]).length} jadwal · Diurutkan berdasarkan tanggal`;
  if(!rows.length){tbody.innerHTML='<tr><td colspan="5" class="text-center text-muted py-3">Tidak ada jadwal sesuai filter.</td></tr>';return;}
  rows.sort((a,b)=>String(a.tanggal).localeCompare(String(b.tanggal))||String(a.nama).localeCompare(String(b.nama)));
  let currentDate='';
  tbody.innerHTML=rows.map(s=>{
    let dayHeader='';
    if(s.tanggal!==currentDate){currentDate=s.tanggal;dayHeader=`<tr class="table-primary"><td colspan="5" class="fw-bold py-2">${formatIndonesianDate(s.tanggal)}</td></tr>`;}
    return `${dayHeader}<tr><td><small>${formatIndonesianDate(s.tanggal)}</small></td><td><b>${s.nama||'-'}</b><br><small class="text-muted">@${s.username||'-'}</small></td><td><span class="badge ${s.shift==='PAGI'?'bg-primary':'bg-success'}">${s.shift==='PAGI'?'PAGI':'SIANG'}</span></td><td><small>${s.catatan||'-'}</small></td><td class="text-center"><button class="btn btn-xs btn-outline-danger" onclick="handleDeleteSchedule(${s.rowIndex})" title="Hapus jadwal"><i class="fa-solid fa-trash"></i></button></td></tr>`;
  }).join('');
}

function changeScheduleMonth(delta){scheduleCalendarCursor.setMonth(scheduleCalendarCursor.getMonth()+delta);renderScheduleCalendar();}
function goScheduleToday(){scheduleCalendarCursor=new Date();renderScheduleCalendar();}
function renderScheduleCalendar(){
  const host=document.getElementById('schedule-calendar');if(!host)return;
  const y=scheduleCalendarCursor.getFullYear(),m=scheduleCalendarCursor.getMonth();
  const title=document.getElementById('schedule-calendar-title');if(title)title.textContent=new Date(y,m,1).toLocaleDateString('id-ID',{month:'long',year:'numeric'});
  const first=new Date(y,m,1).getDay(),days=new Date(y,m+1,0).getDate();
  const names=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
  let html=names.map(n=>`<div class="schedule-calendar-head">${n}</div>`).join('');
  for(let i=0;i<first;i++)html+='<div class="schedule-calendar-empty"></div>';
  for(let d=1;d<=days;d++){
    const key=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const entries=(allSchedulesList||[]).filter(x=>String(x.tanggal).slice(0,10)===key);
    const pagi=entries.filter(x=>x.shift==='PAGI').length,siang=entries.filter(x=>x.shift==='SIANG').length;
    const selected=document.getElementById('schedule-calendar-detail')?.dataset.date===key;
    html+=`<button type="button" class="schedule-calendar-day ${selected?'selected':''}" onclick="selectScheduleCalendarDate('${key}')"><strong>${d}</strong><span>${entries.length?`${entries.length} peserta`:''}</span><small>${pagi?`<i class="fa fa-circle text-primary"></i> ${pagi}`:''} ${siang?`<i class="fa fa-circle text-success"></i> ${siang}`:''}</small></button>`;
  }
  host.innerHTML=html;
}
function selectScheduleCalendarDate(key){
  const detail=document.getElementById('schedule-calendar-detail');if(!detail)return;detail.dataset.date=key;
  const rows=(allSchedulesList||[]).filter(x=>String(x.tanggal).slice(0,10)===key).sort((a,b)=>String(a.shift).localeCompare(String(b.shift))||String(a.nama).localeCompare(String(b.nama)));
  detail.innerHTML=`<h6 class="fw-bold text-dark">${formatIndonesianDate(key)} · ${rows.length} jadwal</h6>`+(rows.length?`<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Peserta</th><th>Shift</th><th>Catatan</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${escapeHtml(x.nama||'-')}</b><br><small>@${escapeHtml(x.username||'-')}</small></td><td><span class="badge ${x.shift==='PAGI'?'bg-primary':'bg-success'}">${escapeHtml(x.shift||'-')}</span></td><td>${escapeHtml(x.catatan||'-')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="text-muted">Tidak ada jadwal pada tanggal ini.</p>');renderScheduleCalendar();
}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function loadAuditLogs(){
  const body=document.getElementById('audit-log-body');if(!body)return;body.innerHTML='<tr><td colspan="4" class="text-center text-muted">Memuat log...</td></tr>';
  const res=await callAppsScript('getAuditLogs',{username:currentUser?.username});
  if(!res?.success){body.innerHTML=`<tr><td colspan="4" class="text-danger text-center">${escapeHtml(res?.message||'Gagal memuat log')}</td></tr>`;return;}
  const rows=res.data||[];body.innerHTML=rows.length?rows.map(r=>`<tr><td>${escapeHtml(r.waktu||'-')}</td><td>${escapeHtml(r.admin||'-')}</td><td><span class="badge bg-primary">${escapeHtml(r.aktivitas||'-')}</span></td><td>${escapeHtml(r.detail||'-')}</td></tr>`).join(''):'<tr><td colspan="4" class="text-center text-muted">Belum ada aktivitas tercatat.</td></tr>';
}

function clearScheduleFilters(){
  ['schedule-filter-date','schedule-filter-user','schedule-filter-shift','schedule-filter-search'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderScheduleList();
}

function exportScheduleList(){
  const rows=allSchedulesList||[];
  const csv=[['Tanggal','Nama','Username','Shift','Catatan'],...rows.map(s=>[s.tanggal,s.nama,s.username,s.shift,s.catatan])].map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='Daftar_Jadwal_'+getLocalTodayISO()+'.csv';a.click();URL.revokeObjectURL(a.href);
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
  const start=document.getElementById('filter-attendance-start')?.value||'';
  const end=document.getElementById('filter-attendance-end')?.value||'';

  const filtered = rawAllDetails.filter(r => {
    const matchSearch = r.nama.toLowerCase().includes(search) || r.username.toLowerCase().includes(search);
    const matchStatus = status === '' || r.status === status || (status === 'HADIR' && (r.status === 'MASUK' || r.status === 'HADIR'));
    const date=String(r.tanggal||'').slice(0,10);
    const matchDate=(!start||date>=start)&&(!end||date<=end);
    return matchSearch && matchStatus && matchDate;
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

  const search=(document.getElementById('filter-search-name')?.value||'').toLowerCase();const status=document.getElementById('filter-status')?.value||'';const start=document.getElementById('filter-attendance-start')?.value||'';const end=document.getElementById('filter-attendance-end')?.value||'';
  const exportRows=rawAllDetails.filter(r=>{const nm=String(r.nama||'').toLowerCase(),un=String(r.username||'').toLowerCase(),dt=String(r.tanggal||'').slice(0,10);const ms=!status||r.status===status||(status==='HADIR'&&(r.status==='MASUK'||r.status==='HADIR'));return (!search||nm.includes(search)||un.includes(search))&&ms&&(!start||dt>=start)&&(!end||dt<=end);});
  const dataToExport = exportRows.map(r => ({
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
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada riwayat izin, sakit, atau cuti.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map(r => {
    const actionButtons = '<small class="text-success fw-bold"><i class="fa-solid fa-check-circle me-1"></i>Otomatis tercatat</small>';

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
    case '#tab-belum-absen':
      await loadUnattendedUsers();
      break;
    case '#tab-jadwal-libur':
      await loadAdminJadwalLibur();
      break;
    case '#tab-jadwal':
      await loadAdminDashboard();
      loadJadwalSection();
      if (document.querySelector('#sub-list-jadwal.active, #sub-list-jadwal.show')) await loadAllSchedules();
      break;
    case '#tab-detail-all':
      await loadAllAttendanceDetails();
      break;
    case '#tab-holiday-calendar':
      await loadAdminHolidayCalendar();
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
let cachedUnattendedUsers = [];
let lastUnattendedMeta = { tanggal: '', tanggalFormatted: '' };

function getLocalTodayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function loadUnattendedUsers() {
  const dateInput = document.getElementById('filter-unattended-date');
  const shiftInput = document.getElementById('filter-unattended-shift');
  const tbody = document.getElementById('table-belum-absen-body');

  if (dateInput && !dateInput.value) {
    dateInput.value = getLocalTodayISO();
  }

  const tanggal = dateInput ? dateInput.value : getLocalTodayISO();
  const shift = shiftInput ? shiftInput.value : '';

  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-1"></i> Mengecek peserta yang belum absen...</td></tr>';
  }

  try {
    const response = await fetch(WEB_APP_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'getUnattendedUsers',
        tanggal,
        shift
      })
    });
    const res = await response.json();

    if (!res.success) {
      showToast(res.message || 'Gagal memuat data belum absen.', 'error');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-3">${res.message || 'Gagal memuat data.'}</td></tr>`;
      }
      return;
    }

    cachedUnattendedUsers = Array.isArray(res.data) ? res.data : [];
    lastUnattendedMeta = {
      tanggal: res.tanggal || tanggal,
      tanggalFormatted: res.tanggalFormatted || tanggal
    };

    const countEl = document.getElementById('unattended-total-count');
    const badgeEl = document.getElementById('badge-belum-absen');
    const subtitleEl = document.getElementById('unattended-subtitle');

    if (countEl) countEl.textContent = cachedUnattendedUsers.length;
    if (badgeEl) {
      badgeEl.textContent = cachedUnattendedUsers.length;
      badgeEl.classList.toggle('d-none', cachedUnattendedUsers.length === 0);
    }
    if (subtitleEl) {
      subtitleEl.textContent = `Tanggal: ${lastUnattendedMeta.tanggalFormatted} • Wajib Absen: ${res.totalTerjadwal || 0} peserta • Belum Absen: ${cachedUnattendedUsers.length} peserta`;
    }

    renderUnattendedTable();
  } catch (err) {
    showToast('Koneksi gagal saat mengecek data belum absen.', 'error');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3">Terjadi kesalahan koneksi ke server.</td></tr>';
    }
  }
}

function renderUnattendedTable() {
  const tbody = document.getElementById('table-belum-absen-body');
  if (!tbody) return;

  const keyword = (document.getElementById('search-unattended')?.value || '').trim().toLowerCase();
  const filtered = cachedUnattendedUsers.filter(item => {
    if (!keyword) return true;
    return (
      String(item.nama || '').toLowerCase().includes(keyword) ||
      String(item.username || '').toLowerCase().includes(keyword) ||
      String(item.asalSekolah || '').toLowerCase().includes(keyword)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-success fw-semibold py-4"><i class="fa-solid fa-circle-check me-1"></i> Semua peserta terjadwal sudah absen / tercatat izin pada filter ini.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map((u, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td>
        <div class="fw-bold text-dark">${u.nama}</div>
        <small class="text-muted">@${u.username}</small>
      </td>
      <td>${u.asalSekolah || '-'}</td>
      <td><span class="badge bg-primary">${u.jenisPKL || '-'}</span></td>
      <td class="fw-semibold">${u.jamMasukJadwal || '-'}</td>
      <td>${u.catatanJadwal || '-'}</td>
      <td><span class="badge bg-warning text-dark">BELUM ABSEN</span></td>
    </tr>
  `).join('');
}

function copyUnattendedList() {
  if (!cachedUnattendedUsers.length) {
    showToast('Tidak ada daftar peserta belum absen untuk disalin.', 'info');
    return;
  }

  const lines = [
    `*DAFTAR PESERTA BELUM ABSEN*`,
    `Tanggal: ${lastUnattendedMeta.tanggalFormatted || lastUnattendedMeta.tanggal}`,
    `Total: ${cachedUnattendedUsers.length} orang`,
    ``,
    ...cachedUnattendedUsers.map((u, i) => `${i + 1}. ${u.nama} (@${u.username}) - ${u.jenisPKL || "PKL"} (${u.asalSekolah})`)
  ];

  navigator.clipboard.writeText(lines.join('\n'))
    .then(() => showToast('Daftar belum absen berhasil disalin ke clipboard!', 'success'))
    .catch(() => showToast('Gagal menyalin daftar ke clipboard.', 'error'));
}

function exportUnattendedExcel() {
  if (!cachedUnattendedUsers.length) {
    showToast('Tidak ada data belum absen untuk diexport.', 'info');
    return;
  }
  if (typeof XLSX === 'undefined') {
    showToast('Library Excel belum termuat.', 'error');
    return;
  }

  const rows = cachedUnattendedUsers.map((u, i) => ({
    No: i + 1,
    Tanggal: lastUnattendedMeta.tanggal,
    Username: u.username,
    Nama: u.nama,
    Asal_Sekolah: u.asalSekolah,
    Shift: u.shift,
    Jam_Masuk_Jadwal: u.jamMasukJadwal,
    Catatan_Jadwal: u.catatanJadwal,
    Status: 'BELUM ABSEN'
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Belum_Absen');
  XLSX.writeFile(wb, `Belum_Absen_${lastUnattendedMeta.tanggal || getLocalTodayISO()}.xlsx`);
  showToast('File Excel daftar belum absen berhasil diunduh.', 'success');
}
function toggleCustomOffDays() {
  const val = document.getElementById('gen-jenis-pkl')?.value;
  const wrap = document.getElementById('wrapper-custom-off-days');
  if (wrap) {
    wrap.classList.toggle('d-none', val !== 'CUSTOM');
  }
}
