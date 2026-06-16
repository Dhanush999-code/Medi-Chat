// ─── STATE ────────────────────────────────────
let chatHistory = [];
let attachedImage = null;
let userLocation = "";
let medImageData = null;
let billImageData = null;

// ─── INIT ─────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  fetchHealthTip();
  getLocation();
});

// ─── SIDEBAR ──────────────────────────────────
function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
}

// ─── PANELS ───────────────────────────────────
function showPanel(name) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
  document.getElementById("panel-" + name).classList.add("active");

  // Highlight nav
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    if (item.getAttribute("onclick")?.includes(name)) item.classList.add("active");
  });

  // Topbar title
  const titles = {
    chat: '<i class="fa fa-comment-dots"></i> AI Medical Assistant',
    medicine: '<i class="fa fa-pills"></i> Medicine Analyzer',
    bill: '<i class="fa fa-receipt"></i> Bill Verification',
    complaint: '<i class="fa fa-file-alt"></i> File Complaint',
    history: '<i class="fa fa-history"></i> Chat History',
    profile: '<i class="fa fa-user-circle"></i> My Profile',
    emergency: '<i class="fa fa-ambulance"></i> Emergency'
  };
  document.getElementById("topbar-title").innerHTML = titles[name] || "Medi-Chat";

  if (name === "history") loadHistory();
  if (name === "complaint") loadComplaints();

  // Close sidebar on mobile
  document.getElementById("sidebar").classList.remove("open");
}

// ─── HEALTH TIP ────────────────────────────────
async function fetchHealthTip() {
  try {
    const res = await fetch("/api/health-tip");
    const data = await res.json();
    const el = document.getElementById("tip-text");
    el.textContent = data.tip;
  } catch (e) {}
}

// ─── LOCATION ─────────────────────────────────
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude, longitude } = pos.coords;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
        );
        const data = await res.json();
        userLocation = data.address?.city || data.address?.town || data.address?.state || "India";
        const el = document.getElementById("user-location");
        if (el) el.textContent = userLocation;
      } catch (e) {
        userLocation = "India";
        const el = document.getElementById("user-location");
        if (el) el.textContent = "Location not detected";
      }
    }, () => {
      userLocation = "India";
      const el = document.getElementById("user-location");
      if (el) el.textContent = "Location access denied";
    });
  }
}

// ─── QUICK PROMPTS ────────────────────────────
function quickPrompt(text) {
  document.getElementById("user-input").value = text;
  sendMessage();
}

// ─── IMAGE PREVIEW (chat) ─────────────────────
function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    attachedImage = e.target.result;
    document.getElementById("img-preview").src = attachedImage;
    document.getElementById("img-preview-wrap").style.display = "flex";
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  attachedImage = null;
  document.getElementById("img-preview-wrap").style.display = "none";
  document.getElementById("file-input").value = "";
}

function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}

function handleKey(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ─── SEND MESSAGE ─────────────────────────────
async function sendMessage() {
  const input = document.getElementById("user-input");
  const msg = input.value.trim();
  if (!msg && !attachedImage) return;

  // Append user message
  appendMessage("user", msg, attachedImage);
  input.value = "";
  input.style.height = "auto";

  const imgToSend = attachedImage;
  clearImage();

  // Add to history
  chatHistory.push({ role: "user", content: msg || "[image]" });

  // Show typing
  const typingId = showTyping();

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        history: chatHistory,
        image: imgToSend || null
      })
    });
    const data = await res.json();
    removeTyping(typingId);
    const reply = data.reply || "Sorry, I couldn't get a response. Please try again.";
    appendMessage("ai", reply);
    chatHistory.push({ role: "assistant", content: reply });
    // Keep history manageable
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
  } catch (e) {
    removeTyping(typingId);
    appendMessage("ai", "Connection error. Please check your internet and try again.");
  }
}

// ─── MESSAGE RENDERING ─────────────────────────
function appendMessage(role, text, imgData = null) {
  const area = document.getElementById("chat-area");

  // Remove welcome if present
  const welcome = area.querySelector(".welcome-msg");
  if (welcome) welcome.remove();

  const wrap = document.createElement("div");
  wrap.className = `msg-wrap ${role}`;

  const avatarEl = document.createElement("div");
  avatarEl.className = "msg-avatar";
  avatarEl.innerHTML = role === "user" ? '<i class="fa fa-user"></i>' : '<i class="fa fa-robot"></i>';

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";

  if (imgData) {
    const img = document.createElement("img");
    img.src = imgData;
    bubble.appendChild(img);
  }

  if (text) {
    const textDiv = document.createElement("div");
    textDiv.innerHTML = markdownToHtml(text);
    bubble.appendChild(textDiv);
  }

  const timeEl = document.createElement("div");
  timeEl.className = "msg-time";
  timeEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const msgGroup = document.createElement("div");
  msgGroup.style.display = "flex";
  msgGroup.style.flexDirection = "column";
  msgGroup.style.maxWidth = "70%";
  if (role === "user") msgGroup.style.alignItems = "flex-end";

  msgGroup.appendChild(bubble);
  msgGroup.appendChild(timeEl);

  wrap.appendChild(avatarEl);
  wrap.appendChild(msgGroup);
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
}

function markdownToHtml(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
    .replace(/\n/g, "<br/>");
}

// ─── TYPING INDICATOR ─────────────────────────
function showTyping() {
  const area = document.getElementById("chat-area");
  const id = "typing-" + Date.now();
  const wrap = document.createElement("div");
  wrap.className = "msg-wrap ai";
  wrap.id = id;
  wrap.innerHTML = `
    <div class="msg-avatar"><i class="fa fa-robot"></i></div>
    <div class="msg-bubble">
      <div class="typing-bubble">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  area.appendChild(wrap);
  area.scrollTop = area.scrollHeight;
  return id;
}

function removeTyping(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

// ─── MEDICINE ANALYZER ────────────────────────
function handleMedDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) loadMedFile(file);
}

function previewMedImage(e) {
  const file = e.target.files[0];
  if (file) loadMedFile(file);
}

function loadMedFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    medImageData = e.target.result;
    document.getElementById("med-preview").src = medImageData;
    document.getElementById("med-upload-zone").style.display = "none";
    document.getElementById("med-preview-container").style.display = "block";
    document.getElementById("med-result").style.display = "none";
  };
  reader.readAsDataURL(file);
}

function clearMedImage() {
  medImageData = null;
  document.getElementById("med-upload-zone").style.display = "block";
  document.getElementById("med-preview-container").style.display = "none";
  document.getElementById("med-result").style.display = "none";
  document.getElementById("med-file").value = "";
}

async function analyzeMedicine() {
  if (!medImageData) return;
  const result = document.getElementById("med-result");
  result.style.display = "block";
  result.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Analyzing medicine...';

  try {
    const res = await fetch("/api/analyze-medicine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: medImageData })
    });
    const data = await res.json();
    result.innerHTML = markdownToHtml(data.analysis || "Could not analyze.");
  } catch (e) {
    result.innerHTML = "Error analyzing medicine. Please try again.";
  }
}

// ─── BILL VERIFICATION ────────────────────────
function billTab(tab, el) {
  document.querySelectorAll(".bill-options .tab-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("bill-text-input").style.display = tab === "text" ? "block" : "none";
  document.getElementById("bill-image-input").style.display = tab === "image" ? "block" : "none";
}

function previewBillImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    billImageData = ev.target.result;
    const img = document.getElementById("bill-img-preview");
    img.src = billImageData;
    img.style.display = "block";
  };
  reader.readAsDataURL(file);
}

async function verifyBill() {
  const textInput = document.getElementById("bill-text").value.trim();
  const result = document.getElementById("bill-result");
  result.style.display = "block";
  result.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Verifying bill prices...';

  try {
    const res = await fetch("/api/verify-bill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bill_text: textInput,
        location: userLocation || "India",
        image: billImageData || null
      })
    });
    const data = await res.json();
    result.innerHTML = markdownToHtml(data.analysis || "Could not verify.");
  } catch (e) {
    result.innerHTML = "Error verifying bill. Please try again.";
  }
}

// ─── COMPLAINT ────────────────────────────────
function compTab(tab, el) {
  document.querySelectorAll(".complaint-tabs .tab-btn").forEach(b => b.classList.remove("active"));
  el.classList.add("active");
  document.getElementById("new-complaint").style.display = tab === "new" ? "block" : "none";
  document.getElementById("view-complaints").style.display = tab === "view" ? "block" : "none";
  if (tab === "view") loadComplaints();
}

async function fileComplaint() {
  const doctor = document.getElementById("c-doctor").value;
  const hospital = document.getElementById("c-hospital").value;
  const category = document.getElementById("c-category").value;
  const date = document.getElementById("c-date").value;
  const desc = document.getElementById("c-desc").value.trim();
  const msg = document.getElementById("comp-msg");

  if (!category || !desc) {
    msg.style.display = "block";
    msg.innerHTML = '<span style="color:#ff4757">Please select a category and provide description.</span>';
    return;
  }

  msg.style.display = "block";
  msg.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Submitting complaint...';

  const res = await fetch("/api/complaint", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ doctor_name: doctor, hospital, category, date, description: desc })
  });
  const data = await res.json();
  if (data.success) {
    msg.innerHTML = `<span style="color:var(--accent)"><i class="fa fa-check-circle"></i> ${data.message}</span>`;
    document.getElementById("c-doctor").value = "";
    document.getElementById("c-hospital").value = "";
    document.getElementById("c-category").value = "";
    document.getElementById("c-date").value = "";
    document.getElementById("c-desc").value = "";
  } else {
    msg.innerHTML = '<span style="color:#ff4757">Submission failed. Try again.</span>';
  }
}

async function loadComplaints() {
  const list = document.getElementById("complaints-list");
  list.innerHTML = '<p class="loading"><i class="fa fa-spinner fa-spin"></i> Loading...</p>';

  try {
    const res = await fetch("/api/complaints");
    const data = await res.json();
    if (!data.length) {
      list.innerHTML = '<p class="loading">No complaints filed yet.</p>';
      return;
    }
    list.innerHTML = data.map(c => `
      <div class="complaint-card">
        <div class="c-header">
          <span class="c-id">${c.id}</span>
          <span class="c-status">${c.status}</span>
        </div>
        <div class="c-title">${c.category}</div>
        <div class="c-meta">
          ${c.doctor ? `Dr. ${c.doctor}` : ''} ${c.hospital ? `• ${c.hospital}` : ''} • Filed: ${c.date}
        </div>
      </div>`).join("");
  } catch (e) {
    list.innerHTML = '<p class="loading">Error loading complaints.</p>';
  }
}

// ─── HISTORY ──────────────────────────────────
async function loadHistory() {
  const list = document.getElementById("history-list");
  list.innerHTML = '<p class="loading"><i class="fa fa-spinner fa-spin"></i> Loading...</p>';

  try {
    const res = await fetch("/api/history");
    const data = await res.json();
    if (!data.length) {
      list.innerHTML = '<p class="loading">No chat history yet. Start a conversation!</p>';
      return;
    }
    list.innerHTML = data.map(h => `
      <div class="history-item">
        <div class="h-time"><i class="fa fa-clock"></i> ${h.time}</div>
        <div class="h-user"><span>You:</span> ${escHtml(h.user)}</div>
        <div class="h-ai">${markdownToHtml(h.ai).substring(0, 200)}${h.ai.length > 200 ? '...' : ''}</div>
      </div>`).join("");
  } catch (e) {
    list.innerHTML = '<p class="loading">Error loading history.</p>';
  }
}

// ─── PROFILE ──────────────────────────────────
async function saveProfile() {
  const msg = document.getElementById("profile-msg");
  msg.style.display = "block";
  msg.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Saving...';

  const data = {
    name: document.getElementById("p-name").value,
    age: document.getElementById("p-age").value,
    gender: document.getElementById("p-gender").value,
    blood_group: document.getElementById("p-blood").value,
    allergies: document.getElementById("p-allergies").value,
    chronic_conditions: document.getElementById("p-conditions").value
  };

  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await res.json();
  msg.innerHTML = result.success
    ? '<span style="color:var(--accent)"><i class="fa fa-check-circle"></i> Profile saved successfully!</span>'
    : '<span style="color:#ff4757">Error saving profile.</span>';
}

// ─── FIRST AID ────────────────────────────────
const firstAidData = {
  choking: `<strong>🚨 Choking - Heimlich Maneuver</strong>
1. Stand behind the person and wrap your arms around their waist.
2. Make a fist just above the navel, below the ribcage.
3. Grasp your fist with the other hand.
4. Give 5 quick, upward thrusts into the abdomen.
5. Repeat until the object is expelled or person becomes unconscious.
6. If unconscious, call 108 immediately and begin CPR.`,

  cpr: `<strong>❤️ CPR (Cardiopulmonary Resuscitation)</strong>
1. Check if the person is responsive and breathing.
2. Call 108 immediately.
3. Place heel of one hand on center of chest (between nipples).
4. Interlock fingers and give 30 chest compressions (hard and fast).
5. Tilt head back, lift chin, give 2 rescue breaths.
6. Continue cycles of 30:2 until help arrives.`,

  burn: `<strong>🔥 Burn First Aid</strong>
For minor burns:
1. Cool the burn under cold running water for 10-20 minutes.
2. Do NOT use ice, butter, or toothpaste.
3. Cover loosely with a sterile bandage.
4. Take OTC pain reliever if needed.

For severe burns: Call 108 immediately.
- Do NOT remove clothing stuck to skin.
- Cover with a cool, moist cloth.`,

  bleeding: `<strong>🩸 Controlling Bleeding</strong>
1. Apply firm, direct pressure with a clean cloth or bandage.
2. Do NOT remove the cloth — add more on top if soaked.
3. Elevate the injured area above heart level if possible.
4. Maintain pressure for at least 15 minutes.
5. For severe/uncontrolled bleeding — call 108 immediately.
6. Apply tourniquet only as last resort for limb bleeding.`
};

function showFirstAid(type) {
  const result = document.getElementById("firstaid-result");
  result.style.display = "block";
  result.innerHTML = markdownToHtml(firstAidData[type] || "Information not available.");
}

// ─── UTILS ────────────────────────────────────
function escHtml(text) {
  return (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}