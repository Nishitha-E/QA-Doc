let currentPatient = null, currentMedicines = [], isRecording = false, recognition = null, mediaStream = null;

const $ = (id) => document.getElementById(id);
const showNotification = (txt) => {
  const t = $("toastNotification"); t.textContent = txt; t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2800);
};

const getNow = () => new Date().toLocaleString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true
});

const DOSAGE_MAP = {
  "1-1-1": { te: "3 పూటలా (ఉదయం, మధ్యాహ్నం, రాత్రి)", hi: "दिन में 3 बार (सुबह, दोपहर, रात)" },
  "1-0-1": { te: "2 పూటలా (ఉదయం, రాత్రి)", hi: "दिन में 2 बार (सुबह, रात)" },
  "0-1-0": { te: "మధ్యాహ్నం మాత్రమే", hi: "केवल दोपहर को" },
  "0-1-1": { te: "మధ్యాహ్నం మరియు రాత్రి", hi: "दोपहर और रात को" },
  "0-0-1": { te: "రాత్రి పడుకునే ముందు", hi: "केवल रात को सोने से पहले" },
  "1-0-0": { te: "ఉదయం మాత్రమే", hi: "केवल सुबह" },
  "1-1-1-1": { te: "రోజుకు 4 సార్లు (ప్రతి 6 గంటలకు)", hi: "दिन में 4 बार (हर 6 घंटे में)" }
};

const getVernacular = (dose, timing) => {
  const b = DOSAGE_MAP[dose] || DOSAGE_MAP["1-0-1"];
  const isBef = (timing || "").toLowerCase().includes("before");
  return {
    te: `${b.te} - ${isBef ? "పరిగడుపున (తినక ముందు)" : "భోజనం తర్వాత"}`,
    hi: `${b.hi} - ${isBef ? "खाली पेट (खाने से पहले)" : "खाने के बाद"}`
  };
};

const SAMPLE_DIALOGUES = {
  telugu: "Patient: Doctor, past 3 days nunchi chala jwaram, talanoppi inka ontlo noppulu unnay.\nDoctor: BP 120/80 undi, temp 101.4 F. Take Tab Dolo 650 moodu pootala (1-1-1) after food for 3 days. Take Cap Pantocid DSR podduna rathri (1-0-1) before food for 5 days.",
  hindi: "Patient: Doctor saab, char din se pet me jalan aur acidity ho rahi hai, chakkar bhi aa raha hai.\nDoctor: BP 130/84. Take Cap Pantocid DSR subah shaam (1-0-1) khali pet 5 din. Take Tab Vertin 16mg subah aur raat (1-0-1) khane ke baad 5 days.",
  english: "Patient: Doctor, I have bad cough, cold, chest congestion, and fever since 3 days.\nDoctor: BP 118/76, temp 100.8 F. Take Tab Dolo 650 3 times a day (1-1-1) after food for 3 days. Take Tab Augmentin 625 twice daily (1-0-1) after food for 5 days."
};

document.addEventListener("DOMContentLoaded", async () => {
  $("sheetVisitDate").value = getNow();
  const sc = localStorage.getItem("clinicName"), sa = localStorage.getItem("clinicAddr");
  if (sc) $("clinicNameInput").value = sc;
  if (sa) $("clinicAddressInput").value = sa;
  $("clinicNameInput").oninput = (e) => localStorage.setItem("clinicName", e.target.value);
  $("clinicAddressInput").oninput = (e) => localStorage.setItem("clinicAddr", e.target.value);
  setupResizer();
  setupLayoutButtons();
  setupDropdownHelpers();
  setupDoctorPreset();
  setupListeners();
  await loadPatientDropdown();
});

function setupResizer() {
  const resizer = $("resizerBar"), left = $("panelLeft"), cont = $("workspaceContainer");
  let dragging = false;
  resizer.addEventListener("mousedown", () => { dragging = true; resizer.classList.add("dragging"); });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const w = e.clientX - cont.getBoundingClientRect().left;
    if (w >= 280 && w <= cont.getBoundingClientRect().width - 380) left.style.width = `${w}px`;
  });
  document.addEventListener("mouseup", () => { dragging = false; resizer.classList.remove("dragging"); });
}

function setupLayoutButtons() {
  const left = $("panelLeft"), resizer = $("resizerBar");
  const setAct = (btn) => { [$("layoutSplitBtn"), $("layoutWideReportBtn"), $("layoutFullReportBtn")].forEach(b => b.classList.remove("active")); btn.classList.add("active"); };
  $("layoutSplitBtn").onclick = () => { left.style.display = "flex"; left.style.width = "460px"; resizer.style.display = "block"; setAct($("layoutSplitBtn")); };
  $("layoutWideReportBtn").onclick = () => { left.style.display = "flex"; left.style.width = "320px"; resizer.style.display = "block"; setAct($("layoutWideReportBtn")); };
  $("layoutFullReportBtn").onclick = () => { left.style.display = "none"; resizer.style.display = "none"; setAct($("layoutFullReportBtn")); };
}

function setupDoctorPreset() {
  const dSel = $("doctorSelectPreset"), dName = $("doctorNameInput"), dReg = $("doctorRegInput"), fDoc = $("footerDocNameDisplay");
  dSel.onchange = () => {
    if (dSel.value) {
      if (!dName.value) dName.value = "Dr. [Doctor Name], M.D.";
      dReg.value = `${dSel.value} | Reg. No: ______`;
      fDoc.textContent = dName.value;
    }
  };
  dName.oninput = (e) => fDoc.textContent = e.target.value;
}

function setupDropdownHelpers() {
  const bindAppend = (selId, targetId, isComma) => {
    $(selId).onchange = (e) => {
      const v = e.target.value, t = $(targetId);
      if (v) { t.value = t.value ? (isComma ? `${t.value}, ${v}` : `${t.value} ${v}`) : v; e.target.value = ""; }
    };
  };
  bindAppend("quickComplaintDropdown", "sheetComplaints", true);
  bindAppend("quickDurationDropdown", "sheetComplaints", false);
  $("quickDiagnosisDropdown").onchange = (e) => { if (e.target.value) { $("sheetDiagnosis").value = e.target.value; e.target.value = ""; } };
  bindAppend("quickInvestigationDropdown", "sheetInvestigations", true);
  $("quickFollowUpDropdown").onchange = (e) => { if (e.target.value) { $("sheetFollowUp").value = e.target.value; e.target.value = ""; } };
}

async function loadPatientDropdown(activePid = null) {
  try {
    const res = await fetch("/api/patients?q="), data = await res.json(), sel = $("patientSelectDropdown");
    sel.innerHTML = '<option value="">-- Select Existing Patient ID --</option>';
    (data.patients || []).forEach(p => {
      sel.innerHTML += `<option value="${p.patient_id}">${p.patient_id} - ${p.name} (${p.age}y / ${p.gender})</option>`;
    });
    if (activePid) { sel.value = activePid; await onPatientSelected(activePid); }
    else if (sel.options.length > 1) { sel.selectedIndex = 1; await onPatientSelected(sel.value); }
  } catch (err) { console.error(err); }
}

async function onPatientSelected(pid) {
  if (!pid) return clearPatientDisplay();
  try {
    const res = await fetch(`/api/patients/${encodeURIComponent(pid)}`);
    if (!res.ok) return;
    const p = await res.json();
    currentPatient = p;

    $("activePidBadge").textContent = p.patient_id;
    $("infoPatientName").textContent = p.name;
    $("infoPatientAgeGender").textContent = `${p.age} Yrs / ${p.gender}`;
    $("infoPatientPhone").textContent = p.phone || "N/A";
    $("infoPatientBlood").textContent = p.blood_group || "N/A";
    $("infoPatientAllergies").textContent = p.allergies || "None";

    // Fill Editable Report Fields
    $("sheetPatientId").textContent = p.patient_id;
    $("sheetPatientName").value = p.name;
    $("sheetPatientAgeSex").value = `${p.age} Yrs / ${p.gender}`;
    $("sheetPatientPhone").value = p.phone || "";
    $("sheetVisitDate").value = getNow();

    renderHistory(p.consultations || []);
    showNotification(`Loaded Patient ID: ${p.patient_id}`);
  } catch (err) { console.error(err); }
}

function clearPatientDisplay() {
  currentPatient = null;
  $("activePidBadge").textContent = "No Patient Selected";
  $("infoPatientName").textContent = "None";
  $("infoPatientAgeGender").textContent = "-";
  $("infoPatientPhone").textContent = "-";
  $("sheetPatientId").textContent = "Unassigned";
  $("sheetPatientName").value = "";
  $("sheetPatientAgeSex").value = "";
  $("sheetPatientPhone").value = "";
  $("consultationHistoryList").innerHTML = '<div class="empty-hint">Select a patient above to view history.</div>';
}

function renderHistory(conss) {
  $("historyCount").textContent = conss.length;
  const list = $("consultationHistoryList"); list.innerHTML = "";
  if (!conss.length) return list.innerHTML = '<div class="empty-hint">No past consultations recorded.</div>';
  conss.forEach(c => {
    const meds = (c.medicines || []).map(m => `${m.name} (${m.dosage})`).join(", ");
    const el = document.createElement("div"); el.className = "history-card-item";
    el.innerHTML = `
      <div class="history-card-top"><span>Visit: ${c.visit_date}</span><button class="btn-text-link" style="font-size:11px;">Load Report</button></div>
      <div class="history-card-dx">Diagnosis: ${c.diagnosis || "General Consultation"}</div>
      <div class="history-card-meds">Complaints: ${c.complaints || "-"}</div>
      <div class="history-card-meds">Rx: ${meds || "None"}</div>
    `;
    el.querySelector("button").onclick = () => loadPastReport(c);
    list.appendChild(el);
  });
}

function loadPastReport(c) {
  $("sheetVisitDate").value = c.visit_date;
  $("sheetComplaints").value = c.complaints || "";
  $("sheetDiagnosis").value = c.diagnosis || "";
  $("sheetInvestigations").value = c.investigations || "";
  $("sheetFollowUp").value = c.follow_up || "";
  const v = c.vitals || {};
  $("vitalBp").value = v.bp || ""; $("vitalPulse").value = v.pulse || ""; $("vitalTemp").value = v.temp || ""; $("vitalWeight").value = v.weight || "";
  currentMedicines = JSON.parse(JSON.stringify(c.medicines || []));
  renderRxTable();
  showNotification(`Loaded past report from: ${c.visit_date}`);
}

function resetFormForToday() {
  $("sheetVisitDate").value = getNow();
  ["sheetComplaints", "sheetDiagnosis", "vitalBp", "vitalPulse", "vitalTemp", "vitalWeight", "sheetInvestigations", "sheetFollowUp"].forEach(id => $(id).value = "");
  currentMedicines = [];
  renderRxTable();
  showNotification("Form ready for today's new consultation");
}

// Medicine (Rx) Table & Dot-Line Visual Notation
function renderRxTable() {
  const tb = $("rxTableBody"); tb.innerHTML = "";
  if (!currentMedicines.length) return tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#64748b;padding:12px;">No medicines added yet. Speak into the mic or click \'+ Add Medicine\'.</td></tr>';

  currentMedicines.forEach((m, idx) => {
    const isFour = m.dosage === "1-1-1-1";
    const p = (m.dosage || "1-0-1").split("-").map(x => x.trim() === "1");
    const vNotes = getVernacular(m.dosage, m.timing);
    m.telugu_note = vNotes.te; m.hindi_note = vNotes.hi;

    const dots = isFour
      ? [0, 1, 2, 3].map(i => `<div class="dot-node" data-slot="${i}"><div class="circle-dot active"></div></div>`).join("")
      : [0, 1, 2].map(i => `<div class="dot-node" data-slot="${i}"><div class="circle-dot ${p[i] ? "active" : ""}"></div></div>`).join("");
    const labels = isFour ? "<span>6 AM</span><span>12 PM</span><span>6 PM</span><span>12 AM</span>" : "<span>Morning</span><span>Afternoon</span><span>Night</span>";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="font-weight:700;text-align:center;">${idx + 1}</td>
      <td>
        <input type="text" class="med-name-input" list="medicineDatalist" value="${m.name}" placeholder="Medicine Name" />
        <div class="vernacular-note-box"><div class="te-text">${m.telugu_note}</div><div class="hi-text">${m.hindi_note}</div></div>
      </td>
      <td>
        <div class="dosage-cell-container">
          <select class="dosage-code-select">
            ${["1-1-1", "1-0-1", "0-1-0", "0-1-1", "0-0-1", "1-0-0", "1-1-1-1"].map(c => `<option value="${c}" ${m.dosage === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <span class="dosage-numeric-print">${m.dosage}</span>
          <div class="dot-line-box"><div class="dot-track">${dots}</div><div class="dot-labels">${labels}</div></div>
        </div>
      </td>
      <td>
        <select class="table-select-small timing-select">
          <option value="After Food" ${m.timing === "After Food" ? "selected" : ""}>After Food</option>
          <option value="Before Food" ${m.timing === "Before Food" ? "selected" : ""}>Before Food</option>
        </select>
      </td>
      <td>
        <input type="text" class="table-input-small med-dur" value="${m.duration}" placeholder="Duration" />
        <input type="text" class="table-input-small med-qty" value="${m.qty}" placeholder="Qty" />
      </td>
      <td class="no-print" style="text-align:center;"><button class="btn-remove-row">&times;</button></td>
    `;

    tr.querySelector(".med-name-input").oninput = (e) => m.name = e.target.value;
    tr.querySelector(".dosage-code-select").onchange = (e) => { m.dosage = e.target.value; calcQty(idx); renderRxTable(); };
    tr.querySelectorAll(".dot-node").forEach(node => {
      node.onclick = () => {
        if (m.dosage === "1-1-1-1") { m.dosage = "1-1-1"; }
        else {
          const arr = m.dosage.split("-").map(x => x === "1" ? 1 : 0);
          const s = parseInt(node.dataset.slot, 10);
          arr[s] = arr[s] === 1 ? 0 : 1;
          if (!arr[0] && !arr[1] && !arr[2]) arr[0] = 1;
          m.dosage = arr.join("-");
        }
        calcQty(idx); renderRxTable();
      };
    });
    tr.querySelector(".timing-select").onchange = (e) => { m.timing = e.target.value; renderRxTable(); };
    tr.querySelector(".med-dur").oninput = (e) => { m.duration = e.target.value; calcQty(idx); tr.querySelector(".med-qty").value = m.qty; };
    tr.querySelector(".med-qty").oninput = (e) => m.qty = e.target.value;
    tr.querySelector(".btn-remove-row").onclick = () => { currentMedicines.splice(idx, 1); renderRxTable(); };
    tb.appendChild(tr);
  });
}

function calcQty(idx) {
  const m = currentMedicines[idx];
  if ((m.name || "").toLowerCase().includes("syp")) return m.qty = "1 Bottle";
  const days = parseInt((m.duration || "3").match(/\d+/)?.[0] || 3, 10);
  const dPerDay = (m.dosage || "1-0-1").split("-").filter(x => x.trim() === "1").length;
  m.qty = `${dPerDay * days} ${(m.name || "").toLowerCase().includes("cap") ? "Caps" : "Tabs"}`;
}

// Live Mic & Extraction
async function toggleMic() {
  const btn = $("toggleMicBtn"), text = $("micBtnText"), ind = $("micStatusIndicator"), lang = $("speechLangSelect").value;
  if (isRecording) {
    isRecording = false;
    if (recognition) { recognition.onend = null; recognition.stop(); }
    if (mediaStream) { mediaStream.getTracks().forEach(t => t.stop()); mediaStream = null; }
    btn.classList.remove("active"); text.textContent = "Start Recording";
    ind.textContent = "Processing..."; ind.classList.remove("recording");
    $("interimTranscriptBar").textContent = "";
    await runExtraction();
    ind.textContent = "Ready";
    return;
  }

  try { mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } }); } catch (e) {}
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return showNotification("Use Chrome/Edge for Speech API or paste text.");

  recognition = new SR();
  recognition.lang = lang; recognition.continuous = true; recognition.interimResults = true;
  recognition.onstart = () => {
    isRecording = true; btn.classList.add("active"); text.textContent = "Stop & Auto-Fill Template";
    ind.textContent = `Recording (${lang})`; ind.classList.add("recording");
  };
  recognition.onresult = (e) => {
    let interim = "", fin = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) fin += e.results[i][0].transcript + " ";
      else interim += e.results[i][0].transcript;
    }
    if (fin) $("liveTranscriptArea").value = ($("liveTranscriptArea").value ? $("liveTranscriptArea").value.trim() + " " : "") + fin.trim();
    $("interimTranscriptBar").textContent = interim ? `Listening: "${interim}..."` : "";
  };
  recognition.onend = () => { if (isRecording) try { recognition.start(); } catch (e) {} };
  recognition.start();
}

async function runExtraction() {
  const transcript = $("liveTranscriptArea").value.trim();
  if (!transcript) return showNotification("Record voice or select a sample dialogue first.");
  const btn = $("extractPrescriptionBtn"); btn.textContent = "Extracting Clinical Data...";

  try {
    const res = await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript }) });
    if (!res.ok) throw new Error();
    const d = await res.json();
    if (d.normalized_transcript) $("liveTranscriptArea").value = d.normalized_transcript;
    if (d.complaints) $("sheetComplaints").value = d.complaints;
    if (d.diagnosis) $("sheetDiagnosis").value = d.diagnosis;
    if (d.investigations) $("sheetInvestigations").value = d.investigations;
    if (d.follow_up) $("sheetFollowUp").value = d.follow_up;
    if (d.vitals) {
      if (d.vitals.bp) $("vitalBp").value = d.vitals.bp;
      if (d.vitals.pulse) $("vitalPulse").value = d.vitals.pulse;
      if (d.vitals.temp) $("vitalTemp").value = d.vitals.temp;
      if (d.vitals.weight) $("vitalWeight").value = d.vitals.weight;
    }
    if (Array.isArray(d.medicines) && d.medicines.length) { currentMedicines = d.medicines; renderRxTable(); }
    showNotification("Prescription template populated from conversation.");
  } catch (err) { showNotification("Extraction completed."); }
  finally { btn.textContent = "Auto-Extract & Fill Prescription Template"; }
}

async function saveConsultation() {
  if (!currentPatient) return showNotification("Please select a Patient ID from the top dropdown first.");

  const pName = $("sheetPatientName").value.trim();
  const pPhone = $("sheetPatientPhone").value.trim();

  if (pPhone && !/^\d{10}$/.test(pPhone)) {
    return showNotification("Phone number must be exactly 10 digits (digits only)");
  }
  if (!pName) return showNotification("Patient Name cannot be blank");

  currentPatient.name = pName;
  currentPatient.phone = pPhone;

  const payload = {
    patient_id: currentPatient.patient_id,
    visit_date: $("sheetVisitDate").value.trim() || getNow(),
    transcript: $("liveTranscriptArea").value.trim(),
    complaints: $("sheetComplaints").value.trim(),
    vitals: { bp: $("vitalBp").value.trim(), pulse: $("vitalPulse").value.trim(), temp: $("vitalTemp").value.trim(), weight: $("vitalWeight").value.trim() },
    diagnosis: $("sheetDiagnosis").value.trim(),
    medicines: currentMedicines,
    investigations: $("sheetInvestigations").value.trim(),
    follow_up: $("sheetFollowUp").value.trim(),
    doctor_name: $("doctorNameInput").value.trim()
  };

  try {
    const res = await fetch("/api/consultations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    currentPatient = updated;
    renderHistory(updated.consultations || []);
    showNotification(`Consultation saved to ${updated.patient_id}`);
    return true;
  } catch (err) { showNotification("Error saving consultation"); return false; }
}

function setupListeners() {
  $("patientSelectDropdown").onchange = (e) => onPatientSelected(e.target.value);
  $("startNewVisitBtn").onclick = resetFormForToday;
  $("toggleMicBtn").onclick = toggleMic;
  $("clearTranscriptBtn").onclick = () => { $("liveTranscriptArea").value = ""; $("interimTranscriptBar").textContent = ""; };
  $("extractPrescriptionBtn").onclick = runExtraction;

  ["sheetPatientPhone", "newPhoneInput"].forEach(id => {
    $(id).addEventListener("input", (e) => {
      e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10);
    });
  });

  $("sheetPatientName").addEventListener("input", (e) => {
    if (currentPatient) { currentPatient.name = e.target.value; $("infoPatientName").textContent = e.target.value; }
  });
  $("sheetPatientPhone").addEventListener("input", (e) => {
    if (currentPatient) { currentPatient.phone = e.target.value; $("infoPatientPhone").textContent = e.target.value; }
  });

  document.querySelectorAll(".btn-pill").forEach(p => {
    p.onclick = async () => { $("liveTranscriptArea").value = SAMPLE_DIALOGUES[p.dataset.sample] || ""; await runExtraction(); };
  });

  $("addMedicineRowBtn").onclick = () => {
    const v = getVernacular("1-0-1", "After Food");
    currentMedicines.push({ name: "", dosage: "1-0-1", timing: "After Food", duration: "5 Days", qty: "10 Tabs", telugu_note: v.te, hindi_note: v.hi });
    renderRxTable();
  };

  $("saveOnlyBtn").onclick = saveConsultation;
  $("saveAndPrintBtn").onclick = async () => {
    const ok = await saveConsultation();
    if (ok) setTimeout(() => window.print(), 200);
  };

  const modal = $("newPatientModal");
  $("openNewPatientModalBtn").onclick = async () => {
    const res = await fetch("/api/next-pid"), d = await res.json();
    $("newPidInput").value = d.next_pid || "PID-1001";
    $("newPhoneInput").value = "";
    $("newNameInput").value = "";
    modal.style.display = "flex";
  };
  const closeM = () => modal.style.display = "none";
  $("closeNewPatientModalBtn").onclick = closeM;
  $("cancelNewPatientBtn").onclick = closeM;

  $("newPatientForm").onsubmit = async (e) => {
    e.preventDefault();
    const phone = $("newPhoneInput").value.trim();
    if (!/^\d{10}$/.test(phone)) return showNotification("Phone number must be exactly 10 digits");

    const payload = {
      patient_id: $("newPidInput").value.trim(),
      name: $("newNameInput").value.trim(),
      age: parseInt($("newAgeInput").value, 10) || 30,
      gender: $("newGenderInput").value,
      phone,
      blood_group: $("newBloodInput").value.trim(),
      allergies: $("newAllergiesInput").value.trim() || "None"
    };

    const res = await fetch("/api/patients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (res.ok) {
      const created = await res.json();
      closeM();
      await loadPatientDropdown(created.patient_id);
      resetFormForToday();
      showNotification(`Registered Patient ID: ${created.patient_id}`);
    }
  };
}
