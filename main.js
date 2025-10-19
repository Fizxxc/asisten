// --- Helper umum ---
function el(tag, cls = "") {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function playSound() {
  const a = new Audio("https://cdn.pixabay.com/audio/2022/03/15/audio_2d36059f65.mp3");
  a.play().catch(() => {});
}

// --- Elemen ---
const chatList = document.getElementById("chatList");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const jadwalList = document.getElementById("jadwalList");
const piketList = document.getElementById("piketList");

// --- Bot Chat ---
const botName = "Asisten Kelas 🤖";
const botReplies = [
  { q: ["halo", "hai"], a: "Halo! 👋 Ada yang bisa aku bantu?" },
  { q: ["jadwal", "pelajaran"], a: "Cek jadwal di tab 'Jadwal Pelajaran' 📚" },
  { q: ["piket", "bersih"], a: "Lihat daftar piket di tab 'Jadwal Piket' 🧹" },
  { q: ["terima kasih", "makasih"], a: "Sama-sama! 😊" },
  { q: ["siapa kamu"], a: "Aku Asisten Kelas otomatis buatan DigiCraft.id ⚙️" },
  { q: ["jam berapa"], a: `Sekarang jam ${new Date().toLocaleTimeString("id-ID")}` }
];
for (let i = botReplies.length; i < 200; i++) {
  botReplies.push({ q: [`tanya ${i}`], a: `Jawaban otomatis ke-${i} oleh ${botName}` });
}

// --- Chat ---
function appendChat(sender, msg) {
  const div = el("div", sender === "bot" ? "chat bot" : "chat user");
  div.innerHTML = `<b>${sender === "bot" ? botName : "Kamu"}:</b> ${escapeHtml(msg)}`;
  chatList.appendChild(div);
  chatList.scrollTop = chatList.scrollHeight;
}

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  appendChat("user", text);
  chatInput.value = "";

  let found = botReplies.find(r => r.q.some(q => text.toLowerCase().includes(q)));
  const reply = found ? found.a : "Maaf, aku belum mengerti maksudmu 😅";
  setTimeout(() => {
    appendChat("bot", reply);
    playSound();
  }, 600);
}

sendBtn.onclick = sendMessage;
chatInput.addEventListener("keypress", e => e.key === "Enter" && sendMessage());

// --- Jadwal ---
function loadSchedules() {
  db.collection("jadwalPelajaran").onSnapshot(snapshot => {
    jadwalList.innerHTML = "";
    snapshot.forEach(doc => {
      const d = doc.data();
      const li = el("li", "schedule-item");
      li.innerHTML = `<b>${d.hari}</b>: ${d.mapel} (${d.mulai} - ${d.selesai})`;
      jadwalList.appendChild(li);
    });
  });

  db.collection("jadwalPiket").onSnapshot(snapshot => {
    piketList.innerHTML = "";
    snapshot.forEach(doc => {
      const d = doc.data();
      const li = el("li", "schedule-item");
      li.innerHTML = `<b>${d.hari}</b>: ${d.nama}`;
      piketList.appendChild(li);
    });
  });
}

// --- Notifikasi Otomatis ---
function checkJadwal() {
  const now = new Date();
  const jam = now.getHours();
  const menit = now.getMinutes();

  db.collection("jadwalPelajaran").get().then(snap => {
    snap.forEach(doc => {
      const d = doc.data();
      const hariNow = now.toLocaleDateString("id-ID", { weekday: "long" }).toLowerCase();

      if (hariNow === d.hari.toLowerCase()) {
        const [hMulai, mMulai] = d.mulai.split(":").map(Number);
        const [hSelesai, mSelesai] = d.selesai.split(":").map(Number);

        if (jam === hMulai && menit === mMulai) {
          Swal.fire("📚 Waktunya Belajar!", `Pelajaran ${d.mapel} dimulai sekarang!`, "info");
          playSound();
        }
        if (jam === hSelesai && menit === mSelesai) {
          Swal.fire("✅ Pelajaran Selesai!", `Pelajaran ${d.mapel} telah selesai.`, "success");
          playSound();
          showPiket();
        }
      }
    });
  });
}

function showPiket() {
  const hariNow = new Date().toLocaleDateString("id-ID", { weekday: "long" }).toLowerCase();
  db.collection("jadwalPiket").get().then(snap => {
    snap.forEach(doc => {
      const d = doc.data();
      if (hariNow === d.hari.toLowerCase()) {
        Swal.fire("🧹 Jadwal Piket!", `${d.nama}, jangan lupa piket hari ini ya!`, "warning");
        playSound();
      }
    });
  });
}

loadSchedules();
setInterval(checkJadwal, 60 * 1000);
