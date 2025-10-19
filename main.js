// main.js
import {
  db, collection, addDoc, onSnapshot, query, orderBy, getDocs,
  doc, setDoc
} from "./firebase-config.js";

// Utilities
const $ = (sel) => document.querySelector(sel);
const scheduleTbody = $("#scheduleTbody");
const picketTbody = $("#picketTbody");
const chatBox = $("#chatBox");
const chatForm = $("#chatForm");
const chatInput = $("#chatInput");
const nowClock = $("#nowClock");
const refreshSchedules = $("#refreshSchedules");
const openAddSchedule = $("#openAddSchedule");
const openAddPicket = $("#openAddPicket");
const requestNotifBtn = $("#requestNotifBtn");
const usernameBadge = $("#usernameBadge");

const username = "User-" + Math.random().toString(36).slice(2,8);
usernameBadge.textContent = username;

// Collections
const schedulesCol = collection(db, "schedules"); // each doc: {hari: "Senin", mapel, start: "07:00", end:"08:30", note}
const picketsCol = collection(db, "pickets"); // {hari, lokasi, jam, person}
const chatsCol = collection(db, "chats"); // {user, text, ts}

// UI helpers
function el(tag, cls = "") { const e = document.createElement(tag); if (cls) e.className = cls; return e; }

// Render functions
async function loadAndRenderSchedules(){
  scheduleTbody.innerHTML = "<tr><td class='p-2' colspan='5'>Memuat...</td></tr>";
  picketTbody.innerHTML = "<tr><td class='p-2' colspan='4'>Memuat...</td></tr>";

  // Load schedules
  const sDocs = await getDocs(schedulesCol);
  const sList = [];
  sDocs.forEach(d => { sList.push({id: d.id, ...d.data()}); });
  if (sList.length === 0){
    scheduleTbody.innerHTML = "<tr><td class='p-2' colspan='5'>Belum ada jadwal. Klik 'Tambah Jadwal'.</td></tr>";
  } else {
    scheduleTbody.innerHTML = "";
    sList.sort((a,b) => (a.hari||"").localeCompare(b.hari));
    for (const s of sList) {
      const tr = el("tr");
      tr.innerHTML = `
        <td class="p-2">${s.hari||"-"}</td>
        <td class="p-2">${s.mapel||"-"}</td>
        <td class="p-2">${s.start||"-"}</td>
        <td class="p-2">${s.end||"-"}</td>
        <td class="p-2">${s.note||""}</td>
      `;
      scheduleTbody.appendChild(tr);
    }
  }

  // Load pickets
  const pDocs = await getDocs(picketsCol);
  const pList = [];
  pDocs.forEach(d => pList.push({id: d.id, ...d.data()}));
  if (pList.length === 0){
    picketTbody.innerHTML = "<tr><td class='p-2' colspan='4'>Belum ada piket.</td></tr>";
  } else {
    picketTbody.innerHTML = "";
    pList.sort((a,b) => (a.hari||"").localeCompare(b.hari));
    for (const p of pList){
      const tr = el("tr");
      tr.innerHTML = `
        <td class="p-2">${p.hari||"-"}</td>
        <td class="p-2">${p.lokasi||"-"}</td>
        <td class="p-2">${p.jam||"-"}</td>
        <td class="p-2">${p.person||"-"}</td>
      `;
      picketTbody.appendChild(tr);
    }
  }
}

// Realtime chat listener
function initChatListener(){
  const q = query(chatsCol, orderBy("ts"));
  onSnapshot(q, snap => {
    chatBox.innerHTML = "";
    snap.forEach(docSnap => {
      const m = docSnap.data();
      const wrapper = el("div", "flex");
      const bubble = el("div", `chat-bubble ${m.user === username ? "chat-me ml-auto" : "chat-others"}`);
      bubble.innerHTML = `<strong class="block text-xs">${m.user}</strong><div class="mt-1 text-sm">${escapeHtml(m.text)}</div>`;
      wrapper.appendChild(bubble);
      chatBox.appendChild(wrapper);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  });
}

// Send chat
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  await addDoc(chatsCol, { user: username, text, ts: Date.now() });
  chatInput.value = "";
});

// small sanitize
function escapeHtml(s){ return s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;"); }

// Notifications: check schedule times
let lastNotified = {}; // key => timestamp to avoid duplicates

async function checkNotifications(){
  // Load schedules & pickets once (could be cached)
  const sDocs = await getDocs(schedulesCol);
  const pDocs = await getDocs(picketsCol);
  const sList = []; sDocs.forEach(d => sList.push(d.data()));
  const pList = []; pDocs.forEach(d => pList.push(d.data()));

  const now = new Date();
  // Use locale "id-ID" timezone Asia/Jakarta assumed by browser. Format HH:MM
  const hh = String(now.getHours()).padStart(2,"0");
  const mm = String(now.getMinutes()).padStart(2,"0");
  const timeStr = `${hh}:${mm}`;
  nowClock.textContent = `${timeStr} — ${now.toLocaleDateString('id-ID', { weekday: 'long', day:'numeric', month:'long'})}`;

  // weekday name in Indonesian to match saved 'hari' fields
  const hariId = now.toLocaleDateString('id-ID', { weekday: 'long' }); // e.g., "Senin"

  // Check schedules for start or end
  for (const s of sList){
    if ((s.hari||"").toLowerCase() !== hariId.toLowerCase()) continue;
    if (s.start === timeStr){
      const key = `start|${s.mapel}|${timeStr}`;
      if (!recent(key)) {
        showNotification(`Mulai: ${s.mapel}`, `Jam ${s.start} — Selamat belajar!`);
      }
    }
    if (s.end === timeStr){
      const key = `end|${s.mapel}|${timeStr}`;
      if (!recent(key)) {
        showNotification(`Selesai: ${s.mapel}`, `Jam ${s.end} — Pelajaran selesai.`);
        // when lesson ends, also check picket scheduled at this day/time
        for (const p of pList) {
          if ((p.hari||"").toLowerCase() !== hariId.toLowerCase()) continue;
          if (p.jam === timeStr) {
            const pkKey = `picket|${p.lokasi}|${timeStr}`;
            if (!recent(pkKey)) {
              showNotification(`Piket: ${p.lokasi}`, `Penanggung jawab: ${p.person || "—"}`);
            }
          }
        }
      }
    }
  }
}

function recent(key){
  const now = Date.now();
  if (!lastNotified[key] || (now - lastNotified[key] > 1000*60*2)) { // allow again after 2 min
    lastNotified[key] = now;
    return false;
  }
  return true;
}

function showNotification(title, text){
  // SweetAlert dialog
  Swal.fire({
    title, text, icon: 'info', toast: true, position: 'top-end',
    timer: 8000, showConfirmButton: false
  });

  // Browser notification
  if (("Notification" in window) && Notification.permission === "granted") {
    new Notification(title, { body: text });
  }
}

// Request notification permission
requestNotifBtn.addEventListener("click", async () => {
  if (!("Notification" in window)) {
    Swal.fire("Tidak didukung", "Browser Anda tidak mendukung Notification API.", "warning");
    return;
  }
  const perm = await Notification.requestPermission();
  if (perm === "granted") {
    Swal.fire("Berhasil", "Notifikasi browser diaktifkan.", "success");
  } else {
    Swal.fire("Dibatalkan", "Pengguna menolak notifikasi.", "info");
  }
});

// Add schedule modal (simple prompt-based)
openAddSchedule.addEventListener("click", async () => {
  const { value: formValues } = await Swal.fire({
    title: 'Tambah Jadwal Pelajaran',
    html:
      '<input id="swal-hari" class="swal2-input" placeholder="Hari (Senin)">' +
      '<input id="swal-mapel" class="swal2-input" placeholder="Mapel">' +
      '<input id="swal-start" class="swal2-input" placeholder="Jam Mulai (HH:MM)">' +
      '<input id="swal-end" class="swal2-input" placeholder="Jam Selesai (HH:MM)">' +
      '<input id="swal-note" class="swal2-input" placeholder="Keterangan (opsional)">',
    focusConfirm: false,
    preConfirm: () => {
      return {
        hari: document.getElementById('swal-hari').value,
        mapel: document.getElementById('swal-mapel').value,
        start: document.getElementById('swal-start').value,
        end: document.getElementById('swal-end').value,
        note: document.getElementById('swal-note').value
      }
    }
  });

  if (formValues){
    // basic validation
    if (!formValues.hari || !formValues.mapel || !formValues.start || !formValues.end) {
      Swal.fire("Gagal", "Isi hari, mapel, jam mulai, dan jam selesai.", "error");
      return;
    }
    await addDoc(collection(db,"schedules"), formValues);
    Swal.fire("Sukses", "Jadwal ditambahkan.", "success");
    await loadAndRenderSchedules();
  }
});

// Add picket
openAddPicket.addEventListener("click", async () => {
  const { value: f } = await Swal.fire({
    title: 'Tambah Jadwal Piket',
    html:
      '<input id="swal-phari" class="swal2-input" placeholder="Hari (Senin)">' +
      '<input id="swal-plokasi" class="swal2-input" placeholder="Lokasi (Kelas A)">' +
      '<input id="swal-pjam" class="swal2-input" placeholder="Jam (HH:MM)">' +
      '<input id="swal-pperson" class="swal2-input" placeholder="Penanggung jawab">',
    preConfirm: () => ({
      hari: document.getElementById('swal-phari').value,
      lokasi: document.getElementById('swal-plokasi').value,
      jam: document.getElementById('swal-pjam').value,
      person: document.getElementById('swal-pperson').value
    })
  });
  if (f && f.hari && f.lokasi && f.jam) {
    await addDoc(collection(db,"pickets"), f);
    Swal.fire("Sukses", "Piket ditambahkan.", "success");
    await loadAndRenderSchedules();
  } else {
    Swal.fire("Gagal", "Isi semua field utama.", "error");
  }
});

// refresh button
refreshSchedules.addEventListener("click", loadAndRenderSchedules);

// initial
(async () => {
  await loadAndRenderSchedules();
  initChatListener();
  // poll every 30s to check schedules (you can adjust)
  checkNotifications();
  setInterval(checkNotifications, 30 * 1000);

  // update clock every second
  setInterval(() => {
    const now = new Date();
    $("#nowClock").textContent = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")} — ${now.toLocaleDateString('id-ID', { weekday: 'long', day:'numeric', month:'short'})}`;
  }, 1000);
})();


// main.js
import {
  db, collection, addDoc, onSnapshot, query, orderBy, getDocs
} from "./firebase-config.js";


const botName = "Asisten Kelas 🤖";

// --- Fungsi helper ---
function escapeHtml(s) {
  return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function el(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// --- Chat UI ---
function appendChat(user, text) {
  const wrapper = el("div", "flex");
  const bubble = el(
    "div",
    `chat-bubble ${user === username ? "chat-me ml-auto" : "chat-others"}`
  );
  bubble.innerHTML = `<strong class="block text-xs">${user}</strong><div class="mt-1 text-sm">${escapeHtml(text)}</div>`;
  wrapper.appendChild(bubble);
  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// --- Listener realtime ---
let lastMessageTime = 0;

const q = query(chatsCol, orderBy("ts"));
onSnapshot(q, (snap) => {
  chatBox.innerHTML = "";
  snap.forEach((docSnap) => {
    const m = docSnap.data();
    appendChat(m.user, m.text);
  });

  // Deteksi pesan baru dari user, untuk dibalas bot
  const docs = snap.docs;
  if (docs.length > 0) {
    const last = docs[docs.length - 1];
    const m = last.data();
    if (m.ts > lastMessageTime && m.user !== botName) {
      lastMessageTime = m.ts;
      handleBotResponse(m.text);
    }
  }
});

// --- Kirim chat user ---
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  await addDoc(chatsCol, { user: username, text, ts: Date.now() });
  chatInput.value = "";
});

// --- Sistem BOT ---
async function handleBotResponse(userText) {
  const reply = getBotResponse(userText.toLowerCase());
  setTimeout(async () => {
    await addDoc(chatsCol, { user: botName, text: reply, ts: Date.now() });
  }, 1200); // delay sedikit biar terasa natural
}

// --- Daftar Respon Bot ---
function getBotResponse(input) {
  // Kata kunci penting dan respon singkat
  const responses = {
    "halo": "Halo juga! Ada yang bisa aku bantu hari ini? 😊",
    "hi": "Hai! Selamat datang di Asisten Kelas.",
    "selamat pagi": "Selamat pagi ☀️, semoga harimu menyenangkan!",
    "selamat siang": "Selamat siang! Sudah makan belum? 🍱",
    "selamat sore": "Sore yang cerah ya ☕",
    "selamat malam": "Selamat malam 🌙, waktunya istirahat ya.",
    "terima kasih": "Sama-sama 🙌",
    "siapa kamu": "Aku Asisten Kelas, bot cerdas pembantu jadwal dan chat siswa.",
    "kamu siapa": "Aku asisten kelas digital milik kamu 😄",
    "nama kamu siapa": "Namaku Asisten Kelas! Senang kenal kamu.",
    "jadwal hari ini": "Kamu bisa cek jadwal pelajaran di tabel jadwal di halaman utama 📅",
    "jadwal piket": "Lihat bagian bawah jadwal, di sana ada jadwal piket kelas kamu 🧹",
    "jam berapa sekarang": `Sekarang jam ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`,
    "kapan istirahat": "Biasanya jam 10:00–10:30, tapi cek jadwal pelajaranmu ya 🍔",
    "mapel pertama": "Coba lihat di kolom 'Jam Mulai' di jadwal, itu pelajaran pertama kamu.",
    "guru siapa": "Kamu bisa tanya langsung ke wali kelas untuk detail guru pengajar 👩‍🏫",
    "cuaca hari ini": "Cuacanya cerah, semangat belajar ya! ☀️",
    "lagi ngapain": "Aku lagi bantu kamu ngecek jadwal dan ngeladenin chat 😄",
    "piket siapa hari ini": "Coba lihat tabel 'Jadwal Piket', aku ambil datanya dari Firestore 🔍",
    "ok": "Oke 👍",
    "oke": "Siap!",
    "terimakasih": "Sama-sama, semoga membantu!",
    "bagaimana kabar": "Aku baik! Kamu gimana? 😁",
    "baik": "Syukurlah kamu baik!",
    "buruk": "Jangan sedih, semoga harimu membaik 🌈",
    "siapa yang piket": "Cek jadwal piket di bagian bawah halaman, ya 🧽",
    "hari apa ini": `Sekarang hari ${new Date().toLocaleDateString("id-ID", { weekday: "long" })}`,
    "hari ini apa": `Hari ini ${new Date().toLocaleDateString("id-ID", { weekday: "long" })}`,
    "tanggal berapa": `Sekarang tanggal ${new Date().toLocaleDateString("id-ID")}`,
    "jam masuk": "Biasanya jam 07:00 pagi, tapi tergantung jadwal kelas kamu 🕖",
    "jam pulang": "Biasanya jam 15:00, tapi bisa berbeda tiap hari.",
    "siapa pembuatmu": "Aku dibuat oleh DigiCraft.id 💻",
    "dimana kamu": "Aku berjalan di server Firebase dan Vercel ☁️",
    "fungsi kamu": "Aku bantu urus jadwal, piket, dan chat realtime untuk kelas kamu!",
    "apa kabar": "Aku baik! Kamu gimana?",
    "terlambat": "Cepat masuk kelas ya! 🚪",
    "absen": "Silakan isi absen di sistem utama ya 📝",
    "izin": "Kamu bisa lapor ke guru piket kalau izin.",
    "hadir": "Selamat datang! Catat kehadiranmu ya.",
    "makasih": "Sama-sama 😄",
    "thanks": "You're welcome!",
    "bagus": "Terima kasih!",
    "mantap": "🔥 Mantap juga kamu!",
    "semangat": "Semangat belajar 💪",
    "hebat": "Kamu juga hebat!",
    "bye": "Sampai jumpa! 👋",
    "dadah": "Dadah! 🤗",
    "see you": "See you again soon!",
    "sampai jumpa": "Sampai ketemu lagi!",
    "ngantuk": "Kalau ngantuk, istirahat sebentar ya 😴",
    "lapar": "Wah, waktunya jajan dulu 🍞",
    "haus": "Minum air putih ya 💧",
    "tugas": "Cek jadwal pelajaran untuk lihat kapan tugas dikumpulkan 📝",
    "deadline": "Jangan lupa selesaikan tugas sebelum deadline ⏰",
    "nilai": "Nilai kamu bisa dicek di sistem nilai sekolah.",
    "ujian": "Semangat ya untuk ujiannya 📚",
    "latihan": "Rajin latihan soal biar makin jago 💪",
    "jadwal besok": "Aku bisa bantu tampilkan jadwal besok di bagian tabel utama.",
    "kelas kamu": "Kamu di kelas berapa nih? 😄",
    "kelas berapa": "Aku belum tahu kelas kamu, tapi kamu bisa kasih tahu aku!",
    "info sekolah": "Sekolah kamu keren banget loh! 🏫",
    "guru piket": "Biasanya guru piket berganti tiap minggu.",
    "berita sekolah": "Belum ada update berita terbaru dari sekolah.",
    "kantin": "Kantin buka jam istirahat pertama, jangan telat 🍛",
    "wifi": "Password wifi tanya ke wali kelas aja ya 😅",
    "toilet": "Toilet ada di dekat ruang guru 🚻",
    "upacara": "Upacara biasanya setiap hari Senin pagi.",
    "bendera": "Bendera harus dikibarkan saat upacara 🇮🇩",
    "apel": "Apel pagi dilakukan setiap Senin jam 07:00.",
    "pengumuman": "Belum ada pengumuman baru untuk hari ini.",
    "kelas bersih": "Jaga kebersihan kelas ya 🧹",
    "sampah": "Buang sampah di tempatnya ♻️",
    "spidol": "Spidol biasanya ada di meja guru.",
    "papan tulis": "Papan tulis sudah dibersihkan belum?",
    "absensi": "Absensi dilakukan setiap awal pelajaran.",
    "belajar": "Belajar yang rajin ya! 📖",
    "berdoa": "Jangan lupa berdoa sebelum belajar 🙏",
    "sholat": "Sholat dulu yuk 🕌",
    "senam": "Senam dilakukan setiap Jumat pagi.",
    "olahraga": "Jangan lupa bawa baju olahraga 🏀",
    "praktikum": "Praktikum dilakukan di lab, hati-hati ya!",
    "kimia": "Wah, hati-hati sama bahan kimia berbahaya 😅",
    "biologi": "Belajar tentang kehidupan 🌱",
    "fisika": "Coba hitung gaya Newton deh ⚙️",
    "matematika": "Matematika itu asik kalau sering latihan!",
    "sejarah": "Belajar sejarah itu mengenang perjuangan bangsa 🇮🇩",
    "bhs inggris": "Let’s speak English together! 🇬🇧",
    "bhs indonesia": "Pelajaran Bahasa Indonesia mengajarkan kita menulis dengan baik.",
    "pkn": "Pendidikan kewarganegaraan mengajarkan nilai-nilai kebangsaan.",
    "agama": "Pelajaran agama bikin hati tenang ✨",
    "senbud": "Senbud bikin kita kreatif dan ekspresif 🎨",
    "informatika": "Coding dan komputer seru banget 💻",
    "it": "Teknologi membantu kehidupan manusia modern 🧠",
    "robotik": "Wah, robotik keren banget! 🤖",
    "musik": "Nada dan irama bikin semangat 🎶",
    "ekonomi": "Ekonomi mengajarkan cara mengatur uang 💰",
    "geografi": "Bumi itu luas banget 🌍",
    "sosiologi": "Pelajari masyarakat dan perilakunya 🧑‍🤝‍🧑",
    "bahasa jepang": "こんにちは! (Konnichiwa) 👋",
    "bahasa arab": "مرحبا! (Marhaban) 🕌",
    "terlambat datang": "Cepat masuk sebelum pintu ditutup! 🏃",
    "izin keluar": "Jangan lupa lapor ke guru piket dulu ya!",
    "nilai ujian": "Nilai ujian bisa dicek di sistem sekolah.",
    "ranking": "Kamu bisa lihat ranking di papan pengumuman nanti 🏅",
    "kelas favorit": "Kelas kamu pasti keren 😎",
    "teman": "Teman yang baik itu seperti cahaya di hari gelap 💡"
  };

  // Kalau ada keyword yang cocok
  for (const key in responses) {
    if (input.includes(key)) {
      return responses[key];
    }
  }

  // Jawaban acak fallback
  const defaultReplies = [
    "Menarik! Bisa dijelaskan lebih detail?",
    "Aku belum paham, bisa ulangi pertanyaannya?",
    "Hmm... itu topik yang bagus!",
    "Aku masih belajar untuk menjawab itu 😅",
    "Wah, menarik! Ceritain lebih lanjut dong!",
    "Aku akan bantu sebisa mungkin 😄",
    "Oke noted!",
    "Baik, aku catat dulu ya ✍️"
  ];
  return defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
}
