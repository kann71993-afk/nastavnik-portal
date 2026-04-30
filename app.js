// --- SPLASH SCREEN TRANSITION ---
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        const splash = document.getElementById('premium-splash');
        if (splash) splash.classList.add('splash-hidden');
    }, 2000); 
});

// --- INDEXEDDB SETUP (Replaces localStorage for MockTest to fix 5MB limits) ---
const dbName = "NastavnikDatabase";
let db;

async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, 1);
        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains('store')) { db.createObjectStore('store'); }
        };
        request.onsuccess = (e) => { db = e.target.result; resolve(); };
        request.onerror = (e) => reject(e);
    });
}
async function setDBData(key, value) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('store', 'readwrite');
        tx.objectStore('store').put(value, key);
        tx.oncomplete = () => resolve(); tx.onerror = (e) => reject(e);
    });
}
async function getDBData(key) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction('store', 'readonly');
        const req = tx.objectStore('store').get(key);
        req.onsuccess = () => resolve(req.result); req.onerror = (e) => reject(e);
    });
}

document.addEventListener('submit', e => e.preventDefault());
marked.use({ breaks: true });

const standardDirectives = [
    "Maintain absolute focus. Precision is paramount.",
    "Verify all constraints before finalizing an answer.",
    "Time management is critical to successful completion.",
    "Read all legal and technical disclaimers within case studies.",
    "Ensure adherence to prescribed formatting standards."
];

function displayRandomQuote() {
    const randomIndex = Math.floor(Math.random() * standardDirectives.length);
    const quoteElement = document.getElementById('random-quote-text');
    if (quoteElement) quoteElement.textContent = standardDirectives[randomIndex];
}

function parseText(rawText) {
    if(!rawText) return "";
    
    let processed = rawText.replace(/\[align-(left|center|right|justify)\]([\s\S]*?)\[\/align-\1\]/g, function(match, align, content) {
        return `\n<div style="text-align: ${align};">\n\n${content}\n\n</div>\n`;
    });
    
    const bulletRegex = /^(\s*)([-•◦▪♦\*]|\d+\.|\d+\)|[a-zA-Z]\.|[a-zA-Z]\)|[ivxIVX]+\.|[ivxIVX]+\))\s+(.*)$/gm;
    processed = processed.replace(bulletRegex, function(match, spaces, bullet, content) {
        let parsedContent = marked.parseInline(content);
        let indent = spaces.length * 10; 
        return `\n<div class="custom-li" style="margin-left: ${indent}px;">
                    <div class="custom-li-bullet">${bullet}</div>
                    <div class="custom-li-text">${parsedContent}</div>
                </div>\n`;
    });
    
    return marked.parse(processed);
}

var mockTest = [];
var activeTestQueue = []; 
var examSettings = { password: "", timeH: "", timeM: "", timeS: "", examRules: "", examTitle: "" };
var editingId = null; 
var currentImageData = null; 
var currentPassageImageData = null; 
var cropper = null;
var currentOcrTarget = "";
var currentOcrStatus = "";
var currentInputTarget = "";
var activeExamMode = 'MCQ'; // New logic for the Dashboard choice

var currentOptionsCount = 4;
var examStartTime = 0;
var lastAnswerTime = 0;
var timeSpentPerQuestion = {};
var lastStdState = null;
var lastProState = null;
var examTimerInterval = null;
var timeRemaining = 0;

function processImportedData(rawData) {
    let data;
    
    // New logic: Check if file is encrypted and prompt user. No more hardcoded key.
    if (!rawData.trim().startsWith('{') && !rawData.trim().startsWith('[')) {
        let pwd = prompt("This file is encrypted. Enter the decryption password:");
        if(!pwd) return alert("Import Cancelled.");
        try {
            const bytes = CryptoJS.AES.decrypt(rawData, pwd);
            const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
            if(!decryptedStr) throw new Error();
            data = JSON.parse(decryptedStr);
        } catch(e) { return alert("SYSTEM ERROR: Incorrect password or corrupted file."); }
    } else { 
        data = JSON.parse(rawData); 
    }

    if (Array.isArray(data)) { mockTest = data; examSettings = { password: "", timeH: "", timeM: "", timeS: "", examRules: "", examTitle: "" }; } 
    else { mockTest = data.questions || []; examSettings = data.settings || { password: "", timeH: "", timeM: "", timeS: "", examRules: "", examTitle: "" }; }
    
    if(document.getElementById('exam-lock-pwd')) document.getElementById('exam-lock-pwd').value = examSettings.password || "";
    if(document.getElementById('exam-time-h')) document.getElementById('exam-time-h').value = examSettings.timeH || "";
    if(document.getElementById('exam-time-m')) document.getElementById('exam-time-m').value = examSettings.timeM || "";
    if(document.getElementById('exam-time-s')) document.getElementById('exam-time-s').value = examSettings.timeS || "";
    if(document.getElementById('exam-rules-input')) document.getElementById('exam-rules-input').value = examSettings.examRules || "";
    if(document.getElementById('exam-title-input')) document.getElementById('exam-title-input').value = examSettings.examTitle || "";
    
    updateStorage(); updateQuestionNumber(); 
    alert("DATA SUCCESSFULLY IMPORTED: [ " + mockTest.length + " Questions Loaded ]");
}

window.onload = async function() {
    await initDB();
    renderDynamicOptions();
    showLandingPage(); 
    
    try {
        // Fetching from IndexedDB instead of LocalStorage
        const savedData = await getDBData('assessmentData');
        if (savedData) {
            if (Array.isArray(savedData)) { mockTest = savedData; } 
            else { 
                mockTest = savedData.questions || []; 
                if(savedData.settings) {
                    examSettings.password = savedData.settings.password || "";
                    examSettings.timeH = savedData.settings.timeH || "";
                    examSettings.timeM = savedData.settings.timeM || "";
                    examSettings.timeS = savedData.settings.timeS || "";
                    examSettings.examRules = savedData.settings.examRules || "";
                    examSettings.examTitle = savedData.settings.examTitle || "";
                }
            }
        }
        restoreDraft();
    } catch (e) { console.error("Error loading data", e); }
    
    if(document.getElementById('exam-lock-pwd')) document.getElementById('exam-lock-pwd').value = examSettings.password || "";
    if(document.getElementById('exam-time-h')) document.getElementById('exam-time-h').value = examSettings.timeH || "";
    if(document.getElementById('exam-time-m')) document.getElementById('exam-time-m').value = examSettings.timeM || "";
    if(document.getElementById('exam-time-s')) document.getElementById('exam-time-s').value = examSettings.timeS || "";
    if(document.getElementById('exam-rules-input')) document.getElementById('exam-rules-input').value = examSettings.examRules || "";
    if(document.getElementById('exam-title-input')) document.getElementById('exam-title-input').value = examSettings.examTitle || "";
    
    updateQuestionNumber();
    updateCounts();

    const urlParams = new URLSearchParams(window.location.search);
    const examUrl = urlParams.get('exam');
    if (examUrl) {
        fetch(examUrl)
            .then(response => {
                if (!response.ok) throw new Error("Network response was not ok");
                return response.text();
            })
            .then(rawData => {
                processImportedData(rawData);
            })
            .catch(err => {
                console.error("Fetch Error:", err);
                alert("SYSTEM ERROR: Unable to fetch the exam from the provided link. Ensure the link is publicly accessible.");
            });
    }
};

function formatPenalty(el) {
    let digits = el.value.replace(/^0\.?/, '').replace(/[^0-9]/g, '');
    if (digits.length > 4) digits = digits.substring(0, 4);
    if (digits.length > 0) { el.value = '0.' + digits; } 
    else if (el.value === '' || el.value === '0') { el.value = ''; } 
    else { el.value = '0.'; }
    saveDraft();
}

function indentList(elementId) {
    const el = document.getElementById(elementId);
    const start = el.selectionStart;
    const text = el.value;
    
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = text.length;
    
    let currentLine = text.substring(lineStart, lineEnd);
    const listRegex = /^(\s*)([-•◦▪♦\*]|\d+\.|\d+\)|[a-zA-Z]\.|[a-zA-Z]\)|[ivxIVX]+\.|[ivxIVX]+\))\s*(.*)$/;
    let match = currentLine.match(listRegex);

    if (match) {
        let indent = match[1];
        let marker = match[2];
        let content = match[3];

        let newIndent = indent + "    ";
        let newMarker = marker;

        if (marker === "•") newMarker = "◦";
        else if (marker === "◦") newMarker = "▪";
        else if (/^\d+\.$/.test(marker)) newMarker = "a.";
        else if (/^[a-zA-Z]\.$/.test(marker)) newMarker = "i.";
        else if (/^\d+\)$/.test(marker)) newMarker = "a)";
        else if (/^[a-zA-Z]\)$/.test(marker)) newMarker = "i)";

        let newLine = newIndent + newMarker + " " + content;
        el.value = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
        el.selectionStart = el.selectionEnd = lineStart + newIndent.length + newMarker.length + 1;
        saveDraft();
        el.focus();
    } else {
        el.value = text.substring(0, start) + "    " + text.substring(start);
        el.selectionStart = el.selectionEnd = start + 4;
        saveDraft();
        el.focus();
    }
}

function outdentList(elementId) {
    const el = document.getElementById(elementId);
    const start = el.selectionStart;
    const text = el.value;
    
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', start);
    if (lineEnd === -1) lineEnd = text.length;
    
    let currentLine = text.substring(lineStart, lineEnd);
    const listRegex = /^(\s*)([-•◦▪♦\*]|\d+\.|\d+\)|[a-zA-Z]\.|[a-zA-Z]\)|[ivxIVX]+\.|[ivxIVX]+\))\s*(.*)$/;
    let match = currentLine.match(listRegex);

    if (match) {
        let indent = match[1];
        let marker = match[2];
        let content = match[3];

        if (indent.length >= 4) {
            let newIndent = indent.substring(0, indent.length - 4);
            let newMarker = "•"; 

            if (marker === "▪") newMarker = "◦";
            else if (marker === "◦") newMarker = "•";
            else if (/^[ivxIVX]+\.$/.test(marker)) newMarker = "a.";
            else if (/^[a-zA-Z]\.$/.test(marker)) newMarker = "1.";
            else if (/^[ivxIVX]+\)$/.test(marker)) newMarker = "a)";
            else if (/^[a-zA-Z]\)$/.test(marker)) newMarker = "1)";

            let newLine = newIndent + newMarker + " " + content;
            el.value = text.substring(0, lineStart) + newLine + text.substring(lineEnd);
            el.selectionStart = el.selectionEnd = lineStart + newIndent.length + newMarker.length + 1;
        } else {
            el.value = text.substring(0, lineStart) + content + text.substring(lineEnd);
            el.selectionStart = el.selectionEnd = lineStart;
        }
        saveDraft();
        el.focus();
    }
}

const romanUpper = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];
const romanLower = romanUpper.map(r => r.toLowerCase());

document.addEventListener('keydown', function(e) {
    if (e.target.tagName.toLowerCase() === 'textarea') {
        const el = e.target;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const text = el.value;

        let lineStart = text.lastIndexOf('\n', start - 1) + 1;
        let currentLine = text.substring(lineStart, start);
        
        const listRegex = /^(\s*)([-•◦▪♦\*]|\d+\.|\d+\)|[a-zA-Z]\.|[a-zA-Z]\)|[ivxIVX]+\.|[ivxIVX]+\))\s+/;
        const emptyListRegex = /^(\s*)([-•◦▪♦\*]|\d+\.|\d+\)|[a-zA-Z]\.|[a-zA-Z]\)|[ivxIVX]+\.|[ivxIVX]+\))\s*$/;

        if (e.key === 'Tab') {
            e.preventDefault();
            if (e.shiftKey) { outdentList(el.id); } else { indentList(el.id); }
            return;
        }

        if (e.key === 'Backspace') {
            if (emptyListRegex.test(currentLine)) {
                e.preventDefault();
                outdentList(el.id);
                return;
            }
        }

        if (e.key === 'Enter') {
            const match = currentLine.match(listRegex);
            if (match) {
                e.preventDefault();
                const markerFull = match[0]; 
                const indent = match[1];     
                const pureMarker = match[2]; 
                
                if (currentLine === markerFull.trimRight() + " " || currentLine === markerFull) {
                    el.value = text.substring(0, lineStart) + text.substring(start);
                    el.selectionStart = el.selectionEnd = lineStart;
                    saveDraft();
                    return;
                }

                let nextMarker = indent + pureMarker + " "; 

                if (/^\d+/.test(pureMarker)) {
                    let num = parseInt(pureMarker.match(/\d+/)[0]);
                    nextMarker = indent + pureMarker.replace(/\d+/, num + 1) + " ";
                } else if (/^[a-zA-Z]([\.\)])$/.test(pureMarker) && !/^[ivxIVX]+([\.\)])$/.test(pureMarker.toLowerCase())) {
                    let char = pureMarker.charAt(0);
                    let nextChar = String.fromCharCode(char.charCodeAt(0) + 1);
                    if (nextChar > 'z' && char >= 'a') nextChar = 'a'; 
                    if (nextChar > 'Z' && char < 'a') nextChar = 'A'; 
                    nextMarker = indent + pureMarker.replace(/[a-zA-Z]/, nextChar) + " ";
                } else if (/^[ivxIVX]+([\.\)])$/.test(pureMarker)) {
                    let val = pureMarker.replace(/[\.\)]/g, '').toLowerCase();
                    let idx = romanLower.indexOf(val);
                    if (idx !== -1 && idx < romanLower.length - 1) {
                        let suffix = pureMarker.slice(-1);
                        nextMarker = indent + romanLower[idx+1] + suffix + " ";
                    }
                }
                
                el.value = text.substring(0, start) + '\n' + nextMarker + text.substring(end);
                el.selectionStart = el.selectionEnd = start + 1 + nextMarker.length;
                saveDraft();
            }
        }
    }
});

function formatText(type, elementId) {
    const el = document.getElementById(elementId);
    const start = el.selectionStart; const end = el.selectionEnd; const text = el.value;
    let before = text.substring(0, start); let selected = text.substring(start, end); let after = text.substring(end, text.length);
    
    let injection = selected;
    
    if(type === 'bold') { injection = '**' + selected + '**'; }
    else if(type === 'italic') { injection = '*' + selected + '*'; }
    else if(type === 'underline') { injection = '<u>' + selected + '</u>'; }
    else if(type.startsWith('align-')) {
        const align = type.split('-')[1];
        injection = `[align-${align}]${selected}[/align-${align}]`;
        if (before.length > 0 && !before.endsWith('\n')) { injection = "\n" + injection; }
        if (!after.startsWith('\n')) { injection = injection + "\n"; }
    }
    
    el.value = before + injection + after;
    el.focus(); 
    
    if(selected === '') {
        let offset = injection.length;
        if(type.startsWith('align-')) { offset = injection.indexOf(`[/align-`); }
        else if(type === 'bold') offset = 2;
        else if(type === 'italic') offset = 1;
        else if(type === 'underline') offset = 3;
        el.selectionStart = el.selectionEnd = start + offset;
    } else {
        el.selectionStart = el.selectionEnd = start + injection.length;
    }
    
    saveDraft();
}

function renderDynamicOptions() {
    const container = document.getElementById('dynamic-options-container');
    let currentSel = document.querySelector('input[name="correct-option-radio"]:checked')?.value || 'A';
    
    container.innerHTML = '';
    
    for(let i=0; i<currentOptionsCount; i++) {
        let letter = String.fromCharCode(65 + i);
        let lLower = letter.toLowerCase();
        container.innerHTML += `
        <div class="option-container" style="display:flex; gap:10px; margin-bottom:12px; align-items: flex-start; border: 1px solid #cbd5e1; padding: 10px; border-radius: 4px; background: #fff;">
            <div style="display:flex; flex-direction:column; align-items:center; gap: 5px; margin-top: 5px;">
                <span style="font-weight:bold; font-size: 15px;">${letter}.</span>
                <input type="radio" name="correct-option-radio" value="${letter}" onchange="saveDraft()" title="Mark as Correct Solution" style="width: 18px; height: 18px; cursor: pointer; accent-color: #10b981;">
            </div>
            <textarea id="opt-${lLower}" rows="2" oninput="saveDraft()" placeholder="Option ${letter} detailed text..." style="flex:1; border: none; box-shadow: none; background: transparent; padding: 8px;"></textarea>
            <div style="display:flex; flex-direction:column; gap: 4px;">
                <button type="button" class="btn-small" onclick="swapOptions(${i}, -1)" title="Move Up" style="padding: 2px 8px !important; margin:0; border-radius: 2px !important; color: #64748b !important; border-color: #cbd5e1 !important;">↑</button>
                <button type="button" class="btn-small" onclick="swapOptions(${i}, 1)" title="Move Down" style="padding: 2px 8px !important; margin:0; border-radius: 2px !important; color: #64748b !important; border-color: #cbd5e1 !important;">↓</button>
            </div>
        </div>`;
    }
    
    let targetRadio = document.querySelector(`input[name="correct-option-radio"][value="${currentSel}"]`);
    if(targetRadio) targetRadio.checked = true;
    else {
        let firstRadio = document.querySelector('input[name="correct-option-radio"]');
        if (firstRadio) firstRadio.checked = true;
    }
}

function addOption() { if(currentOptionsCount < 8) { currentOptionsCount++; renderDynamicOptions(); saveDraft(); } }
function removeOption() { if(currentOptionsCount > 2) { currentOptionsCount--; renderDynamicOptions(); saveDraft(); } }

function swapOptions(index, dir) {
    if (index + dir < 0 || index + dir >= currentOptionsCount) return;
    const l1 = String.fromCharCode(65 + index).toLowerCase();
    const l2 = String.fromCharCode(65 + index + dir).toLowerCase();
    const val1 = document.getElementById(`opt-${l1}`).value;
    const val2 = document.getElementById(`opt-${l2}`).value;
    document.getElementById(`opt-${l1}`).value = val2;
    document.getElementById(`opt-${l2}`).value = val1;
    
    const r1 = document.querySelector(`input[name="correct-option-radio"][value="${l1.toUpperCase()}"]`);
    const r2 = document.querySelector(`input[name="correct-option-radio"][value="${l2.toUpperCase()}"]`);
    const r1Checked = r1.checked;
    const r2Checked = r2.checked;
    if(r1Checked) r2.checked = true;
    if(r2Checked) r1.checked = true;

    saveDraft();
}

function togglePassage() {
    const cont = document.getElementById('passage-container');
    const btn = document.getElementById('toggle-passage-btn');
    if(cont.style.display === 'none') { cont.style.display = 'block'; btn.textContent = '➖ Hide Reference Material'; }
    else { cont.style.display = 'none'; btn.textContent = '➕ Add Reference Material (Case Study)'; }
}

function updateExamSettingsUI() {
    examSettings.password = document.getElementById('exam-lock-pwd').value.trim();
    examSettings.timeH = document.getElementById('exam-time-h').value.trim();
    examSettings.timeM = document.getElementById('exam-time-m').value.trim();
    examSettings.timeS = document.getElementById('exam-time-s').value.trim();
    examSettings.examRules = document.getElementById('exam-rules-input').value.trim();
    examSettings.examTitle = document.getElementById('exam-title-input').value.trim();
    updateStorage();
}

function saveDraft() {
    if(editingId !== null) return; 
    let opts = {};
    for(let i=0; i<currentOptionsCount; i++) { let l = String.fromCharCode(97+i); opts[l.toUpperCase()] = document.getElementById(`opt-${l}`).value; }
    
    const ptsVal = parseFloat(document.getElementById('q-points').value);
    const negVal = parseFloat(document.getElementById('q-negative').value);

    const draft = {
        passage: document.getElementById('passage-text').value, question: document.getElementById('question-text').value,
        optionsCount: currentOptionsCount, options: opts, 
        ans: document.querySelector('input[name="correct-option-radio"]:checked')?.value || "A",
        exp: document.getElementById('explanation').value, expW: document.getElementById('explanation-wrong').value,
        points: isNaN(ptsVal) ? "" : ptsVal,
        negative: isNaN(negVal) ? "" : negVal
    };
    sessionStorage.setItem('builderDraft', JSON.stringify(draft));
}

function restoreDraft() {
    const draftStr = sessionStorage.getItem('builderDraft');
    if(draftStr && editingId === null) {
        const draft = JSON.parse(draftStr);
        currentOptionsCount = draft.optionsCount || 4; renderDynamicOptions();
        document.getElementById('passage-text').value = draft.passage || ""; document.getElementById('question-text').value = draft.question || "";
        for(let key in draft.options) { if(document.getElementById(`opt-${key.toLowerCase()}`)) document.getElementById(`opt-${key.toLowerCase()}`).value = draft.options[key]; }
        
        const ans = draft.ans || "A";
        const targetRadio = document.querySelector(`input[name="correct-option-radio"][value="${ans}"]`);
        if(targetRadio) targetRadio.checked = true;

        document.getElementById('explanation').value = draft.exp || ""; document.getElementById('explanation-wrong').value = draft.expW || "";
        
        document.getElementById('q-points').value = draft.points !== undefined ? draft.points : "";
        document.getElementById('q-negative').value = draft.negative !== undefined ? draft.negative : "";

        if(draft.passage.trim() !== "") { document.getElementById('passage-container').style.display = 'block'; document.getElementById('toggle-passage-btn').textContent = '➖ Hide Reference Material'; }
    }
}

function applyScoringToAll() {
    if(mockTest.length === 0) return alert("Vault is empty. Save some questions before applying rules.");
    const pts = parseFloat(document.getElementById('q-points').value);
    const neg = parseFloat(document.getElementById('q-negative').value);
    const validPts = isNaN(pts) ? 1 : pts;
    const validNeg = isNaN(neg) ? 0 : neg;
    
    if(!confirm(`Apply ${validPts} Points and ${validNeg} Negative Penalty to ALL ${mockTest.length} questions in the vault?`)) return;
    
    mockTest.forEach(q => {
        q.points = validPts;
        q.negativeMultiplier = validNeg;
    });
    updateStorage();
    renderQuestionList();
    alert(`Scoring rules applied successfully to all questions.`);
}

function openModal(modalId, targetId) {
    if(targetId) currentInputTarget = targetId; document.getElementById(modalId).style.display = 'flex';
    if(modalId === 'std-table-modal') generateStdGrid(true); if(modalId === 'pro-table-modal') generateProGrid(true);
}
function closeModal(modalId) { document.getElementById(modalId).style.display = 'none'; }

function openSettings() {
    document.getElementById('top-controls-bar').style.display = "none"; 
    document.getElementById('builder-section').style.display = "none";
    document.getElementById('settings-section').style.display = "block";
    window.scrollTo(0, 0);
}

function closeSettings() {
    document.getElementById('top-controls-bar').style.display = "flex"; 
    document.getElementById('settings-section').style.display = "none";
    document.getElementById('builder-section').style.display = "block";
    window.scrollTo(0, 0);
}

function generateStdGrid(isInitialOpen = false) {
    const rows = parseInt(document.getElementById('std-rows').value) || 1; const cols = parseInt(document.getElementById('std-cols').value) || 1;
    const container = document.getElementById('std-grid-area'); let eData = {};
    if (!isInitialOpen) container.querySelectorAll('.tb-cell-input').forEach(i => eData[i.id] = i.value);
    let html = '<table style="width: 100%; border: none;">';
    for(let r = 0; r < rows; r++) {
        html += `<tr>`;
        for(let c = 0; c < cols; c++) { const ph = (r === 0) ? 'Header...' : 'Data...'; html += `<td style="padding: 5px; border: 1px solid #cbd5e1; vertical-align:top;"><textarea id="std-c-${r}-${c}" class="tb-cell-input" rows="2" placeholder="${ph}"></textarea></td>`; }
        html += '</tr>';
    } html += '</table>'; container.innerHTML = html;
    if (!isInitialOpen) for(let r = 0; r < rows; r++) for(let c = 0; c < cols; c++) if(eData[`std-c-${r}-${c}`] !== undefined) document.getElementById(`std-c-${r}-${c}`).value = eData[`std-c-${r}-${c}`];
}
function saveStdState() {
    const rows = parseInt(document.getElementById('std-rows').value) || 1; const cols = parseInt(document.getElementById('std-cols').value) || 1;
    let state = { rows, cols, cells: [] };
    for(let r=0; r<rows; r++) { state.cells[r] = []; for(let c=0; c<cols; c++) state.cells[r][c] = document.getElementById(`std-c-${r}-${c}`).value; }
    lastStdState = state;
}
function restoreStdState() {
    if(!lastStdState) return alert("No previous Standard Table data found.");
    document.getElementById('std-rows').value = lastStdState.rows; document.getElementById('std-cols').value = lastStdState.cols; generateStdGrid(true);
    for(let r=0; r<lastStdState.rows; r++) for(let c=0; c<lastStdState.cols; c++) document.getElementById(`std-c-${r}-${c}`).value = lastStdState.cells[r][c];
}
function injectStdTable() {
    saveStdState(); 
    const rows = parseInt(document.getElementById('std-rows').value) || 1; const cols = parseInt(document.getElementById('std-cols').value) || 1;
    let html = `\n\n<table style="width: 100%; border-collapse: collapse; border: 1px solid #000; margin-top: 10px; margin-bottom: 10px;">\n`;
    for(let r = 0; r < rows; r++) {
        html += `  <tr style="${(r === 0) ? 'background-color: #e2e8f0;' : ''}">\n`;
        for(let c = 0; c < cols; c++) {
            let val = document.getElementById(`std-c-${r}-${c}`).value.replace(/\n/g, '<br>').replace(/  /g, '&nbsp;&nbsp;').trim();
            if(val.includes('*') || val.includes('1.') || val.includes('- ')) { val = marked.parseInline(val); }
            html += `    <${(r===0)?'th':'td'} style="padding: 10px; border: 1px solid #000; vertical-align: top; ${(r===0)?'font-weight: bold;':''}">${val}</${(r===0)?'th':'td'}>\n`;
        } html += `  </tr>\n`;
    } html += `</table>`;
    const target = document.getElementById(currentInputTarget); target.value += target.value.trim() !== "" ? html : html.trimStart(); closeModal('std-table-modal'); saveDraft();
}

function generateProGrid(isInitialOpen = false) {
    const rows = parseInt(document.getElementById('pt-rows').value) || 1; const cols = parseInt(document.getElementById('pt-cols').value) || 1;
    const container = document.getElementById('pt-grid-area'); let eData = {}, eAlign = {}, eVAlign = {}, eBorder = {}, eType = {}, eWidth = {};
    if (!isInitialOpen) {
        container.querySelectorAll('.tb-cell-input:not(.pt-col-width)').forEach(i => eData[i.id] = i.value); container.querySelectorAll('.btn-align').forEach(b => eAlign[b.id] = b.dataset.val);
        container.querySelectorAll('.btn-valign').forEach(b => eVAlign[b.id] = b.dataset.val); container.querySelectorAll('.btn-border').forEach(b => eBorder[b.id] = b.dataset.val);
        container.querySelectorAll('.btn-type').forEach(b => eType[b.id] = b.dataset.val); container.querySelectorAll('.pt-col-width').forEach(i => eWidth[i.id] = i.value);
    }
    let html = '<table style="width: auto; min-width: 100%; border: none;"><tr>';
    for(let c = 0; c < cols; c++) html += `<td style="padding: 2px; border:none; text-align:center;"><input type="number" id="pt-w-${c}" class="pt-col-width tb-cell-input" placeholder="Width %" style="text-align: center; margin-bottom: 5px; background: #e0f2fe; border-color: #bae6fd; font-weight: bold; font-size: 11px; padding: 6px !important;" min="1" max="100"></td>`;
    html += '</tr>';
    for(let r = 0; r < rows; r++) {
        html += `<tr>`;
        for(let c = 0; c < cols; c++) {
            const cId = `pt-c-${r}-${c}`, aId = `pt-a-${r}-${c}`, vId = `pt-v-${r}-${c}`, bId = `pt-b-${r}-${c}`, tId = `pt-t-${r}-${c}`;
            let controls = `<div class="tb-controls-mini"><button type="button" id="${aId}" class="tb-mini-btn btn-align" data-val="left" onclick="cycAlign(this)">L / C / R</button><button type="button" id="${vId}" class="tb-mini-btn btn-valign" data-val="top" onclick="cycVAlign(this)">T / M / B</button></div>
                <div class="tb-controls-mini" style="margin-top: 4px;"><button type="button" id="${bId}" class="tb-mini-btn btn-border" data-val="none" onclick="cycBorder(this)">Line: None</button><button type="button" id="${tId}" class="tb-mini-btn btn-type" data-val="data" onclick="cycType(this)">Bg: NONE</button></div>`;
            html += `<td style="padding: 5px; border: none; vertical-align:top;"><div class="tb-cell-wrapper"><textarea id="${cId}" class="tb-cell-input" rows="2" placeholder="Text..."></textarea>${controls}</div></td>`;
        } html += '</tr>';
    } html += '</table>'; container.innerHTML = html;
    if (!isInitialOpen) {
        for(let c = 0; c < cols; c++) if(eWidth[`pt-w-${c}`] !== undefined) document.getElementById(`pt-w-${c}`).value = eWidth[`pt-w-${c}`];
        for(let r = 0; r < rows; r++) {
            for(let c = 0; c < cols; c++) {
                if(eData[`pt-c-${r}-${c}`] !== undefined) document.getElementById(`pt-c-${r}-${c}`).value = eData[`pt-c-${r}-${c}`];
                if(eAlign[`pt-a-${r}-${c}`]) { const b=document.getElementById(`pt-a-${r}-${c}`); b.dataset.val=eAlign[`pt-a-${r}-${c}`]; updAlignUI(b); }
                if(eVAlign[`pt-v-${r}-${c}`]) { const b=document.getElementById(`pt-v-${r}-${c}`); b.dataset.val=eVAlign[`pt-v-${r}-${c}`]; updVAlignUI(b); }
                if(eBorder[`pt-b-${r}-${c}`]) { const b=document.getElementById(`pt-b-${r}-${c}`); b.dataset.val=eBorder[`pt-b-${r}-${c}`]; updBorderUI(b); }
                if(eType[`pt-t-${r}-${c}`]) { const b=document.getElementById(`pt-t-${r}-${c}`); b.dataset.val=eType[`pt-t-${r}-${c}`]; updTypeUI(b); }
            }
        }
    } else {
        for(let r=0; r<rows; r++) {
            for(let c=0; c<cols; c++) {
                updAlignUI(document.getElementById(`pt-a-${r}-${c}`)); updVAlignUI(document.getElementById(`pt-v-${r}-${c}`)); updBorderUI(document.getElementById(`pt-b-${r}-${c}`));
                const tBtn = document.getElementById(`pt-t-${r}-${c}`); tBtn.dataset.val = (r === 0) ? 'header' : 'data'; updTypeUI(tBtn);
            }
        }
    }
}
function cycAlign(b) { b.dataset.val = b.dataset.val === 'left' ? 'center' : (b.dataset.val === 'center' ? 'right' : 'left'); updAlignUI(b); }
function cycVAlign(b) { b.dataset.val = b.dataset.val === 'top' ? 'middle' : (b.dataset.val === 'middle' ? 'bottom' : 'top'); updVAlignUI(b); }
function cycBorder(b) { b.dataset.val = b.dataset.val === 'none' ? 'single' : (b.dataset.val === 'single' ? 'double' : 'none'); updBorderUI(b); }
function cycType(b) { b.dataset.val = b.dataset.val === 'data' ? 'header' : 'data'; updTypeUI(b); }
function updAlignUI(b) { b.innerText = `Align: ${b.dataset.val.toUpperCase()}`; }
function updVAlignUI(b) { b.innerText = `Pos: ${b.dataset.val.toUpperCase()}`; }
function updBorderUI(b) { b.innerText = `Line: ${b.dataset.val.toUpperCase()}`; }
function updTypeUI(b) { if(b.dataset.val === 'header') { b.innerText = `Bg: GRAY`; b.style.backgroundColor = '#e2e8f0'; b.style.color = '#000'; } else { b.innerText = `Bg: NONE`; b.style.backgroundColor = ''; b.style.color = ''; } }
function saveProState() {
    const rows = parseInt(document.getElementById('pt-rows').value) || 1; const cols = parseInt(document.getElementById('pt-cols').value) || 1;
    let state = { rows, cols, widths: [], cells: [] };
    for(let c=0; c<cols; c++) state.widths[c] = document.getElementById(`pt-w-${c}`).value;
    for(let r=0; r<rows; r++) {
        state.cells[r] = [];
        for(let c=0; c<cols; c++) state.cells[r][c] = { val: document.getElementById(`pt-c-${r}-${c}`).value, align: document.getElementById(`pt-a-${r}-${c}`).dataset.val, valign: document.getElementById(`pt-v-${r}-${c}`).dataset.val, border: document.getElementById(`pt-b-${r}-${c}`).dataset.val, type: document.getElementById(`pt-t-${r}-${c}`).dataset.val };
    }
    lastProState = state;
}
function restoreProState() {
    if(!lastProState) return alert("No previous Pro Table data found.");
    document.getElementById('pt-rows').value = lastProState.rows; document.getElementById('pt-cols').value = lastProState.cols; generateProGrid(true); 
    for(let c=0; c<lastProState.cols; c++) document.getElementById(`pt-w-${c}`).value = lastProState.widths[c];
    for(let r=0; r<lastProState.rows; r++) {
        for(let c=0; c<lastProState.cols; c++) {
            let cd = lastProState.cells[r][c]; document.getElementById(`pt-c-${r}-${c}`).value = cd.val;
            let btnA = document.getElementById(`pt-a-${r}-${c}`); btnA.dataset.val = cd.align; updAlignUI(btnA);
            let btnV = document.getElementById(`pt-v-${r}-${c}`); btnV.dataset.val = cd.valign; updVAlignUI(btnV);
            let btnB = document.getElementById(`pt-b-${r}-${c}`); btnB.dataset.val = cd.border; updBorderUI(btnB);
            let btnT = document.getElementById(`pt-t-${r}-${c}`); btnT.dataset.val = cd.type; updTypeUI(btnT);
        }
    }
}
function injectProTable() {
    saveProState(); 
    const rows = parseInt(document.getElementById('pt-rows').value) || 1; const cols = parseInt(document.getElementById('pt-cols').value) || 1;
    let html = `\n\n<table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-top: 10px; margin-bottom: 10px;">\n`;
    let colgroup = '  <colgroup>\n'; let hasWidths = false;
    for(let c = 0; c < cols; c++) { let w = document.getElementById(`pt-w-${c}`).value.trim(); if(w) { colgroup += `    <col style="width: ${w}%;">\n`; hasWidths = true; } else { colgroup += `    <col>\n`; } }
    colgroup += '  </colgroup>\n'; if(hasWidths) html += colgroup;
    for(let r = 0; r < rows; r++) {
        html += `  <tr>\n`;
        for(let c = 0; c < cols; c++) {
            let val = document.getElementById(`pt-c-${r}-${c}`).value.replace(/\n/g, '<br>');
            if(val.includes('*') || val.includes('1.') || val.includes('- ')) { val = marked.parseInline(val); }
            let align = document.getElementById(`pt-a-${r}-${c}`).dataset.val, valign = document.getElementById(`pt-v-${r}-${c}`).dataset.val, border = document.getElementById(`pt-b-${r}-${c}`).dataset.val, type = document.getElementById(`pt-t-${r}-${c}`).dataset.val;
            let btmBorder = 'border-bottom: none !important;'; if(border === 'single') btmBorder = 'border-bottom: 1px solid #000 !important;'; if(border === 'double') btmBorder = 'border-bottom: 3px double #000 !important;';
            let rightBorder = (c < cols - 1) ? 'border-right: 1px solid #000 !important;' : 'border-right: none !important;';
            let fw = '', bg = '', tag = 'td'; if(type === 'header') { fw = 'font-weight: bold;'; bg = 'background-color: #e2e8f0;'; tag = 'th'; }
            html += `    <${tag} style="padding: 10px; text-align: ${align}; vertical-align: ${valign}; ${rightBorder} ${btmBorder} border-top: none !important; border-left: none !important; ${fw} ${bg}">${val}</${tag}>\n`;
        } html += `  </tr>\n`;
    } html += `</table>`;
    const target = document.getElementById(currentInputTarget); target.value += target.value.trim() !== "" ? html : html.trimStart(); closeModal('pro-table-modal'); saveDraft();
}

function openCropper(event, targetId, statusId) {
    const file = event.target.files[0]; if (!file) return;
    currentOcrTarget = targetId; currentOcrStatus = statusId;
    const reader = new FileReader();
    reader.onload = function(e) {
        const image = document.getElementById('cropper-image'); image.src = e.target.result; openModal('cropper-modal');
        if (cropper) cropper.destroy(); cropper = new Cropper(image, { viewMode: 1, autoCropArea: 0.8, background: false });
    }; reader.readAsDataURL(file); event.target.value = ""; 
}
document.getElementById('btn-crop-scan').addEventListener('click', async function() {
    if (!cropper) return;
    const canvas = cropper.getCroppedCanvas(); const croppedImageData = canvas.toDataURL('image/jpeg', 0.9);
    closeModal('cropper-modal'); const statusEl = document.getElementById(currentOcrStatus); statusEl.textContent = "PROCESSING...";
    try {
        const result = await Tesseract.recognize(croppedImageData, 'eng+mal', { logger: m => { if (m.status === 'recognizing text') statusEl.textContent = `SCANNING... ${Math.round(m.progress * 100)}%`; } });
        const targetTextArea = document.getElementById(currentOcrTarget);
        if (targetTextArea.value.trim() !== "") targetTextArea.value += "\n\n" + result.data.text.trim(); else targetTextArea.value = result.data.text.trim();
        statusEl.textContent = "CAPTURE SUCCESSFUL"; saveDraft(); setTimeout(() => { statusEl.textContent = ""; }, 4000);
    } catch (error) { statusEl.textContent = "CAPTURE FAILED"; }
});
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image(); img.onload = function() {
            const canvas = document.createElement('canvas'); const MAX_WIDTH = 1024; const MAX_HEIGHT = 1024; 
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height); callback(canvas.toDataURL('image/jpeg', 0.8)); 
        }; img.src = e.target.result;
    }; reader.readAsDataURL(file);
}
function previewImage(event) { const file = event.target.files[0]; if (!file) return; compressImage(file, function(compressedData) { currentImageData = compressedData; document.getElementById('image-preview').src = currentImageData; document.getElementById('image-preview').style.display = "block"; document.getElementById('clear-image-btn').style.display = "inline-block"; }); }
function clearImage() { currentImageData = null; document.getElementById('q-image').value = ""; document.getElementById('image-preview').src = ""; document.getElementById('image-preview').style.display = "none"; document.getElementById('clear-image-btn').style.display = "none"; }
function previewPassageImage(event) { const file = event.target.files[0]; if (!file) return; compressImage(file, function(compressedData) { currentPassageImageData = compressedData; document.getElementById('passage-image-preview').src = currentPassageImageData; document.getElementById('passage-image-preview').style.display = "block"; document.getElementById('clear-passage-image-btn').style.display = "inline-block"; }); }
function clearPassageImage() { currentPassageImageData = null; document.getElementById('passage-image').value = ""; document.getElementById('passage-image-preview').src = ""; document.getElementById('passage-image-preview').style.display = "none"; document.getElementById('clear-passage-image-btn').style.display = "none"; }

function toggleNightMode() { document.body.classList.toggle('dark-mode'); document.getElementById('night-mode-btn').textContent = document.body.classList.contains('dark-mode') ? "☼ Light Theme" : "◐ Dark Theme"; }
function changeFont() { document.documentElement.style.setProperty('--base-font', document.getElementById('font-selector').value); }

// --- Navigation Logic ---
function showLandingPage() {
    clearInterval(examTimerInterval);
    document.getElementById('top-controls-bar').style.display = "none"; 
    document.getElementById('landing-section').style.display = "flex";
    document.getElementById('builder-section').style.display = "none"; 
    document.getElementById('test-section').style.display = "none"; 
    document.getElementById('result-section').style.display = "none"; 
    document.getElementById('qs-section').style.display = "none";
    document.getElementById('journal-section').style.display = "none";
    document.getElementById('settings-section').style.display = "none"; 
    window.scrollTo(0, 0);
}

// Updated for Dynamic Mode selection
function openBuilder(mode) {
    if (mode) activeExamMode = mode; // Save mode selection
    document.getElementById('top-controls-bar').style.display = "flex"; 
    document.getElementById('landing-section').style.display = "none";
    document.getElementById('builder-section').style.display = "block";
    document.getElementById('qs-section').style.display = "none";
    document.getElementById('settings-section').style.display = "none";
    
    // Adjust UI based on mode
    if (activeExamMode === 'DESC') {
        document.getElementById('form-title').innerHTML = `Author Descriptive Question #<span id="current-q-num">${mockTest.length + 1}</span>`;
        document.getElementById('mcq-options-group').style.display = 'none';
        document.getElementById('neg-scoring-group').style.display = 'none';
        document.getElementById('wrong-exp-group').style.display = 'none';
        document.getElementById('correct-exp-label').textContent = 'Grading Rubric / Model Answer:';
    } else {
        document.getElementById('form-title').innerHTML = `Author MCQ Question #<span id="current-q-num">${mockTest.length + 1}</span>`;
        document.getElementById('mcq-options-group').style.display = 'block';
        document.getElementById('neg-scoring-group').style.display = 'block';
        document.getElementById('wrong-exp-group').style.display = 'block';
        document.getElementById('correct-exp-label').textContent = 'Correct Answer Rationale (Optional):';
        renderDynamicOptions();
    }
    updateQuestionNumber();
    window.scrollTo(0, 0);
}

function openJournal() {
    document.getElementById('top-controls-bar').style.display = "flex"; 
    document.getElementById('landing-section').style.display = "none";
    document.getElementById('builder-section').style.display = "none";
    document.getElementById('qs-section').style.display = "none";
    document.getElementById('test-section').style.display = "none";
    document.getElementById('result-section').style.display = "none";
    document.getElementById('settings-section').style.display = "none";
    document.getElementById('journal-section').style.display = "block";
    renderJournal(journalMonth, journalYear);
}

function accessQs() { 
    document.getElementById('top-controls-bar').style.display = "flex"; 
    document.getElementById('builder-section').style.display = "none"; 
    document.getElementById('settings-section').style.display = "none";
    document.getElementById('qs-section').style.display = "block"; 
    renderQuestionList(); 
}

function goHome() {
    showLandingPage();
}

function renderMath() { if (window.MathJax) MathJax.typesetPromise().catch(err => console.log(err.message)); }

function updateCounts() {
    const count = mockTest.length;
    document.getElementById('btn-total-count').textContent = count; 
    document.getElementById('vault-total-count').textContent = count;
    
    const startBtn = document.getElementById('start-test-btn'); 
    if (startBtn) {
        if (count > 0) { startBtn.disabled = false; } else { startBtn.disabled = true; }
    }
}

async function updateStorage() {
    try { 
        await setDBData('assessmentData', { questions: mockTest, settings: examSettings }); 
        updateCounts(); 
    } catch (e) { alert("SYSTEM ALERT: STORAGE CAPACITY EXCEEDED."); }
}

async function exportData(isSecure) {
    if (mockTest.length === 0) return alert("SYSTEM LOG: NO DATA DETECTED FOR EXPORT");
    updateExamSettingsUI();
    
    const dataStr = JSON.stringify({ questions: mockTest, settings: examSettings }, null, 2);
    let finalOutput = dataStr;
    let ext = '.json';
    let mimeType = 'application/json';

    if (isSecure) {
        let pwd = prompt("Create a password to securely encrypt this file:");
        if(!pwd) return alert("Export Cancelled. Password is required for secure export.");
        finalOutput = CryptoJS.AES.encrypt(dataStr, pwd).toString();
        ext = '.enc'; mimeType = 'text/plain';
    }

    const baseName = examSettings.examTitle ? examSettings.examTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() : 'assessment_data';
    const fileName = baseName + ext;

    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{ description: isSecure ? 'Encrypted Exam File' : 'JSON Exam File', accept: { [mimeType]: [ext] } }]
            });
            const writable = await handle.createWritable(); await writable.write(finalOutput); await writable.close(); alert("DATA WRITTEN SUCCESSFULLY");
        } else {
            const blob = new Blob([finalOutput], { type: mimeType }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
        } await updateStorage(); 
    } catch (err) { console.error(err); }
}

function importData(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) { processImportedData(e.target.result); }; reader.readAsText(file); event.target.value = ""; 
}

// Updated Save Question with Duplicate check and Mode check
async function saveQuestion(keepContext = false) {
    const qText = document.getElementById('question-text').value; 
    const errorMsg = document.getElementById('error-msg'); 
    errorMsg.style.display = "none";
    
    if (!qText.trim()) { 
        errorMsg.textContent = "VALIDATION FAILED: INCOMPLETE FIELDS DETECTED."; 
        errorMsg.style.display = "block"; 
        return; 
    }

    // DUPLICATE CHECK
    const isDuplicate = mockTest.some(q => 
        q.question.trim().toLowerCase() === qText.trim().toLowerCase() && 
        q.id !== editingId 
    );

    if (isDuplicate) {
        if (!confirm("DUPLICATE DETECTED: This exact question already exists in the vault. Do you still want to save it?")) {
            return; 
        }
    }
    
    const ptsVal = parseFloat(document.getElementById('q-points').value);
    
    const qData = {
        type: activeExamMode,
        passage: document.getElementById('passage-text').value, passageImage: currentPassageImageData, 
        question: qText, image: currentImageData, 
        explanation: document.getElementById('explanation').value, 
        points: isNaN(ptsVal) ? 1 : ptsVal
    };

    // Mode specific saving
    if (activeExamMode === 'MCQ') {
        let opts = {}; let hasEmptyOpt = false;
        for(let i=0; i<currentOptionsCount; i++) { let l = String.fromCharCode(65+i); let val = document.getElementById(`opt-${l.toLowerCase()}`).value.trim(); opts[l] = val; if(!val) hasEmptyOpt = true; }
        if(hasEmptyOpt) { errorMsg.textContent = "VALIDATION FAILED: EMPTY OPTIONS DETECTED."; errorMsg.style.display = "block"; return; }
        
        const negVal = parseFloat(document.getElementById('q-negative').value);
        qData.options = opts;
        qData.answer = document.querySelector('input[name="correct-option-radio"]:checked')?.value || "A";
        qData.explanationWrong = document.getElementById('explanation-wrong').value;
        qData.negativeMultiplier = isNaN(negVal) ? 0 : negVal;
    }

    if (editingId !== null) {
        const index = mockTest.findIndex(q => q.id === editingId); qData.id = editingId; mockTest[index] = qData;
        editingId = null; document.getElementById('save-btn').textContent = "Commit Question"; document.getElementById('save-keep-btn').style.display = "inline-block"; document.getElementById('cancel-btn').style.display = "none"; alert("RECORD UPDATED");
    } else { qData.id = mockTest.length + 1; mockTest.push(qData); alert("RECORD APPENDED"); }
    
    await updateStorage(); sessionStorage.removeItem('builderDraft'); 
    
    if(keepContext) { 
        document.getElementById('question-text').value = ""; clearImage(); document.getElementById('explanation').value = ""; document.getElementById('explanation-wrong').value = ""; 
        currentOptionsCount = 4; if(activeExamMode==='MCQ') renderDynamicOptions(); updateQuestionNumber(); window.scrollTo(0, 0); 
    } else { 
        clearForm(); window.scrollTo(0, 0); 
    }
}

function editQuestion(id) {
    const q = mockTest.find(q => q.id === id); if (!q) return;
    
    activeExamMode = q.type || 'MCQ'; // Set mode based on what was saved
    
    document.getElementById('passage-text').value = q.passage || ""; 
    if(q.passage && String(q.passage).trim() !== "") { document.getElementById('passage-container').style.display = "block"; document.getElementById('toggle-passage-btn').textContent = "➖ Hide Reference Material"; } else { document.getElementById('passage-container').style.display = "none"; document.getElementById('toggle-passage-btn').textContent = "➕ Add Reference Material (Case Study)"; }
    document.getElementById('question-text').value = q.question;
    
    if(activeExamMode === 'MCQ') {
        currentOptionsCount = Object.keys(q.options || {}).length || 4; renderDynamicOptions();
        for(let key in q.options) { if(document.getElementById(`opt-${key.toLowerCase()}`)) document.getElementById(`opt-${key.toLowerCase()}`).value = q.options[key]; }
        
        const ans = q.answer || "A";
        const targetRadio = document.querySelector(`input[name="correct-option-radio"][value="${ans}"]`);
        if(targetRadio) targetRadio.checked = true;
        document.getElementById('q-negative').value = (q.negativeMultiplier !== undefined && q.negativeMultiplier !== 0) ? q.negativeMultiplier : "";
        document.getElementById('explanation-wrong').value = q.explanationWrong || "";
    }

    document.getElementById('q-points').value = (q.points !== undefined && q.points !== 1) ? q.points : "";
    
    document.getElementById('explanation').value = q.explanation || ""; 
    if (q.image) { currentImageData = q.image; document.getElementById('image-preview').src = currentImageData; document.getElementById('image-preview').style.display = "block"; document.getElementById('clear-image-btn').style.display = "inline-block"; } else clearImage();
    if (q.passageImage) { currentPassageImageData = q.passageImage; document.getElementById('passage-image-preview').src = currentPassageImageData; document.getElementById('passage-image-preview').style.display = "block"; document.getElementById('clear-passage-image-btn').style.display = "inline-block"; document.getElementById('passage-container').style.display = "block"; document.getElementById('toggle-passage-btn').textContent = "➖ Hide Reference Material"; } else clearPassageImage();
    editingId = id; document.getElementById('current-q-num').textContent = id + " (Editing)";
    document.getElementById('save-btn').textContent = "Overwrite Record"; document.getElementById('save-keep-btn').style.display = "none"; document.getElementById('cancel-btn').style.display = "inline-block"; 
    openBuilder(activeExamMode); 
}

function cloneQuestion(id) { editQuestion(id); cancelEdit(); window.scrollTo(0, 0); alert("RECORD DUPLICATED TO BUFFER. SUBMIT TO SAVE."); }
function cancelEdit() { editingId = null; document.getElementById('save-btn').textContent = "Commit Question"; document.getElementById('save-keep-btn').style.display = "inline-block"; document.getElementById('cancel-btn').style.display = "none"; clearForm(); }
async function deleteQuestion(id) { if (!confirm("WARNING: PERMANENTLY ERASE RECORD?")) return; mockTest = mockTest.filter(q => q.id !== id); mockTest.forEach((q, i) => q.id = i + 1); await updateStorage(); renderQuestionList(); }

async function clearAllData() { 
    if (confirm("CRITICAL WARNING: PURGE ALL LOCAL DATA (INCLUDING VAULT AND STRATEGIC LEDGER)?")) { 
        mockTest = []; 
        localStorage.clear(); // Clears Journal
        
        // Clear IndexedDB 
        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction('store', 'readwrite');
                tx.objectStore('store').clear();
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e);
            });
        } catch(e){}
        
        await updateStorage(); 
        clearForm(); 
        renderJournal(journalMonth, journalYear);
        alert("Wipe Complete: Question Vault and Strategic Ledger have been permanently erased.");
    } 
}

function clearForm() { 
    ['passage-text', 'question-text', 'explanation', 'explanation-wrong', 'q-points', 'q-negative'].forEach(id => document.getElementById(id).value = ""); 
    currentOptionsCount = 4; if(activeExamMode === 'MCQ') renderDynamicOptions(); clearImage(); clearPassageImage(); updateQuestionNumber(); 
    document.getElementById('passage-container').style.display = "none"; document.getElementById('toggle-passage-btn').textContent = "➕ Add Reference Material (Case Study)"; sessionStorage.removeItem('builderDraft');
}
function updateQuestionNumber() { if (editingId === null) document.getElementById('current-q-num').textContent = mockTest.length + 1; }

function renderQuestionList() {
    const listArea = document.getElementById('question-list-area'); listArea.innerHTML = "";
    if (mockTest.length === 0) return listArea.innerHTML = "<p>NO RECORDS FOUND.</p>";
    mockTest.forEach(item => {
        const imgHtml = item.image ? `<img src="${item.image}" class="q-image-display" style="max-height: 100px;">` : "";
        const pIndicator = (item.passage || item.passageImage) ? `<div style="font-size: 11px; font-weight: bold; margin-bottom: 10px; text-transform: uppercase;">[ LINKED SCENARIO DETECTED ]</div>` : "";
        const scoringInfo = `<span style="color: #0ea5e9; font-size: 12px; margin-left: 10px; font-weight: bold;">[ ${item.points !== undefined ? item.points : 1} Pts | -${item.negativeMultiplier !== undefined ? item.negativeMultiplier : 0} Penalty | Mode: ${item.type || 'MCQ'} ]</span>`;
        
        listArea.innerHTML += `<div class="q-card"><strong>ID: Q${item.id}</strong>${scoringInfo}<hr style="border: 0; border-top: 1px solid #000; margin: 10px 0;"> ${pIndicator}<div class="preserve-format">${parseText(item.question)}</div>${imgHtml}
            <button type="button" class="btn-small" onclick="cloneQuestion(${item.id})">Clone</button><button type="button" class="btn-small" onclick="editQuestion(${item.id})">Modify</button><button type="button" class="btn-small" style="color: #dc2626 !important; border-color: #dc2626 !important;" onclick="deleteQuestion(${item.id})">Delete</button></div>`;
    }); renderMath();
}

function startTest() {
    if (mockTest.length === 0) return alert("ERROR: NO DATA LOADED.");
    if (examSettings.password && examSettings.password.trim() !== "") {
        document.getElementById('student-password-input').value = ''; document.getElementById('student-auth-error').style.display = 'none'; openModal('student-auth-modal');
        setTimeout(() => document.getElementById('student-password-input').focus(), 100);
    } else executeStartTest();
}

function submitStudentAuth() {
    if (document.getElementById('student-password-input').value === examSettings.password) { closeModal('student-auth-modal'); executeStartTest(); } 
    else { document.getElementById('student-auth-error').style.display = "block"; document.getElementById('student-auth-error').textContent = "ACCESS DENIED."; }
}

function recordTime(qId) {
    if (!timeSpentPerQuestion[qId]) { const now = Date.now(); timeSpentPerQuestion[qId] = Math.round((now - lastAnswerTime) / 1000); lastAnswerTime = now; }
}

function checkAnswer(qId, correctAns) {
    const radios = document.querySelectorAll(`input[name="q${qId}"]`);
    let selectedVal = null;
    
    radios.forEach(radio => {
        if (radio.checked) selectedVal = radio.value;
        radio.disabled = true; 
    });
    
    if (!selectedVal) return;
    
    const feedbackDiv = document.getElementById(`feedback-${qId}`);
    const statusDiv = document.getElementById(`feedback-status-${qId}`);
    
    feedbackDiv.style.display = "block";
    
    if (selectedVal === correctAns) {
        statusDiv.innerHTML = `<span class="badge badge-correct" style="font-size: 13px; padding: 6px 12px;">✔ CORRECT</span>`;
    } else {
        statusDiv.innerHTML = `<span class="badge badge-wrong" style="font-size: 13px; padding: 6px 12px;">✖ INCORRECT</span>`;
    }
}

function updateTimerDisplay() {
    const timerDisplay = document.getElementById('exam-timer');
    const h = Math.floor(timeRemaining / 3600);
    const m = Math.floor((timeRemaining % 3600) / 60);
    const s = timeRemaining % 60;
    
    timerDisplay.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: -2px;">
            <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
        </svg> 
        Time Remaining: ${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}
    `;
    
    if(timeRemaining <= 60) {
        timerDisplay.style.color = "#ef4444"; 
    } else {
        timerDisplay.style.color = ""; 
    }
}

// Updated for DESC Mode
function executeStartTest() {
    document.getElementById('top-controls-bar').style.display = "flex"; 
    document.getElementById('builder-section').style.display = "none"; document.getElementById('test-section').style.display = "block";
    const testArea = document.getElementById('test-area'); testArea.innerHTML = ""; 
    
    const timerDisplay = document.getElementById('exam-timer');
    const h = parseInt(examSettings.timeH) || 0;
    const m = parseInt(examSettings.timeM) || 0;
    const s = parseInt(examSettings.timeS) || 0;
    const totalSeconds = (h * 3600) + (m * 60) + s;

    if (totalSeconds > 0) {
        timeRemaining = totalSeconds;
        timerDisplay.style.display = "flex";
        updateTimerDisplay();
        clearInterval(examTimerInterval);
        examTimerInterval = setInterval(() => {
            timeRemaining--;
            updateTimerDisplay();
            if (timeRemaining <= 0) {
                clearInterval(examTimerInterval);
                alert("Time is up! Automatically submitting your exam.");
                submitTest();
            }
        }, 1000);
    } else {
        timerDisplay.style.display = "none";
        clearInterval(examTimerInterval);
    }
    
    let groups = []; let currentGroup = []; let currentPassageKey = null;
    mockTest.forEach(q => {
        let pKey = (q.passage || "") + (q.passageImage || "");
        if (pKey !== "") { if (pKey === currentPassageKey) { currentGroup.push(q); } else { if (currentGroup.length > 0) groups.push(currentGroup); currentGroup = [q]; currentPassageKey = pKey; } } 
        else { if (currentGroup.length > 0) groups.push(currentGroup); currentGroup = []; currentPassageKey = null; groups.push([q]); }
    });
    if (currentGroup.length > 0) groups.push(currentGroup);
    for (let i = groups.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [groups[i], groups[j]] = [groups[j], groups[i]]; }
    activeTestQueue = groups.flat();

    examStartTime = Date.now(); lastAnswerTime = Date.now(); timeSpentPerQuestion = {};
    let lastPText = ""; let lastPImg = "";

    activeTestQueue.forEach((item, index) => {
        let pHtml = "";
        if (item.passage || item.passageImage) {
            if (item.passage !== lastPText || item.passageImage !== lastPImg) {
                pHtml = `<div class="passage-box"><div class="passage-title">EXHIBIT / REFERENCE</div>${item.passageImage ? `<img src="${item.passageImage}" class="q-image-display">` : ""}<div class="preserve-format">${parseText(item.passage || "")}</div></div>`;
                lastPText = item.passage || ""; lastPImg = item.passageImage || "";
            }
        } else { lastPText = ""; lastPImg = ""; }
        
        let interactionHtml = '';
        let feedbackHtml = '';

        // Differentiate output based on question type
        if (item.type === 'DESC') {
            interactionHtml = `<textarea id="q${item.id}-desc" rows="4" placeholder="Type your answer here..." style="width: 100%; padding: 10px; margin-top: 10px; font-family: var(--base-font);"></textarea>`;
            let expCorrectHtml = item.explanation ? `<div class="explanation-box preserve-format" style="margin-top: 10px;"><strong style="text-transform: uppercase;">Grading Rubric / Model Answer:</strong><br>${parseText(item.explanation)}</div>` : "";
            feedbackHtml = `<div id="feedback-${item.id}" class="feedback-section"><div style="margin-bottom: 10px; font-size: 15px; color: #f59e0b;"><strong>[ PENDING MANUAL REVIEW ]</strong></div>${expCorrectHtml}</div>`;
        } else {
            for (let key in item.options) {
                interactionHtml += `<div style="margin-bottom: 12px;"><label class="radio-label"><input type="radio" name="q${item.id}" value="${key}" onchange="recordTime(${item.id}); checkAnswer(${item.id}, '${item.answer}')"> <strong>[ ${key} ]</strong> ${item.options[key]}</label></div>`;
            }
            let expCorrectHtml = item.explanation ? `<div class="explanation-box preserve-format" style="margin-top: 10px;"><strong style="text-transform: uppercase;">Correct Rationale:</strong><br>${parseText(item.explanation)}</div>` : "";
            let expWrongHtml = item.explanationWrong ? `<div class="explanation-box-wrong preserve-format" style="margin-top: 10px;"><strong style="text-transform: uppercase;">Traps/Analysis:</strong><br>${parseText(item.explanationWrong)}</div>` : "";
            feedbackHtml = `
                <div id="feedback-${item.id}" class="feedback-section">
                    <div id="feedback-status-${item.id}" style="margin-bottom: 10px;"></div>
                    <div style="margin-bottom: 10px; font-size: 15px;"><strong>VERIFIED ANSWER: [ ${item.answer} ]</strong></div>
                    ${expCorrectHtml}
                    ${expWrongHtml}
                </div>
            `;
        }

        testArea.innerHTML += `<div>${pHtml}<div class="q-card"><strong style="font-size: 1.1em; border-bottom: 2px solid #000; padding-bottom: 5px; display: inline-block; margin-bottom: 15px;">Question ${index + 1} <span style="font-size: 13px; color: #64748b; font-weight: normal;">[${item.points !== undefined ? item.points : 1} Pts]</span></strong><div class="preserve-format">${parseText(item.question)}</div>${item.image ? `<img src="${item.image}" class="q-image-display">` : ""}${interactionHtml}${feedbackHtml}</div></div>`;
    }); window.scrollTo(0, 0); renderMath();
}

function submitTest() {
    clearInterval(examTimerInterval);
    const totalTimeSeconds = Math.round((Date.now() - examStartTime) / 1000);
    const formattedTime = `${Math.floor(totalTimeSeconds / 60)}m ${totalTimeSeconds % 60}s`;
    
    let earnedScore = 0; 
    let maxScore = 0; 
    let manualReviews = 0;
    
    activeTestQueue.forEach(item => { 
        document.getElementById(`feedback-${item.id}`).style.display = "block";
        
        if (item.type === 'DESC') {
            manualReviews++;
        } else {
            const pts = item.points !== undefined ? item.points : 1;
            const negMult = item.negativeMultiplier !== undefined ? item.negativeMultiplier : 0;
            
            maxScore += pts;
            
            const selectedRadio = document.querySelector(`input[name="q${item.id}"]:checked`);
            if (selectedRadio) {
                if (selectedRadio.value === item.answer) {
                    earnedScore += pts;
                } else {
                    earnedScore -= (pts * negMult);
                }
            }
        }
    });
    
    earnedScore = Math.round(earnedScore * 100) / 100;
    const percentage = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;
    let tier = percentage >= 90 ? "Exceptional" : percentage >= 75 ? "Proficient" : percentage >= 60 ? "Competent" : "Needs Review";

    let manualNote = manualReviews > 0 ? `<div style="color: #b45309; font-weight: bold; margin-top: 15px;">NOTE: ${manualReviews} Descriptive question(s) require manual grading. Auto-score does not reflect essay points.</div>` : "";

    document.getElementById('score-display').innerHTML = `
    <div class="results-dashboard">
        <div class="stat-card"><div class="stat-value">${earnedScore} / ${maxScore}</div><div class="stat-label">Auto-Score</div></div>
        <div class="stat-card"><div class="stat-value">${percentage}%</div><div class="stat-label">Auto-Accuracy</div></div>
        <div class="stat-card"><div class="stat-value">${formattedTime}</div><div class="stat-label">Time</div></div>
        <div class="stat-card"><div class="stat-value">${manualReviews}</div><div class="stat-label">Pending Reviews</div></div>
    </div>${manualNote}`;

    displayRandomQuote(); 

    document.getElementById('test-section').style.display = "none"; 
    document.getElementById('result-section').style.display = "block";
    window.scrollTo(0, 0); 
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully.'))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

let currentJDate = new Date();
let journalMonth = currentJDate.getMonth();
let journalYear = currentJDate.getFullYear();

function navMonth(direction) {
    journalMonth += direction;
    if (journalMonth < 0) { journalMonth = 11; journalYear--; }
    else if (journalMonth > 11) { journalMonth = 0; journalYear++; }
    renderJournal(journalMonth, journalYear);
}

function renderJournal(month, year) {
    const container = document.getElementById('journal-list-container');
    container.innerHTML = '';

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    
    document.getElementById('month-year-display').textContent = `${monthNames[month]} ${year}`;

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let todayElementId = null;

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dayName = dayNames[dateObj.getDay()];
        
        const isToday = (day === currentJDate.getDate() && month === currentJDate.getMonth() && year === currentJDate.getFullYear());
        const rowClass = isToday ? 'journal-row journal-today-highlight' : 'journal-row';
        
        const rowId = `journal-row-${day}`;
        if (isToday) todayElementId = rowId;

        const rowDiv = document.createElement('div');
        rowDiv.className = rowClass;
        rowDiv.id = rowId;

        const dateCol = document.createElement('div');
        dateCol.className = 'journal-date-col';
        dateCol.innerHTML = `<span class="journal-day-name">${dayName}</span><span class="journal-day-num">${day}</span>`;

        const inputCol = document.createElement('div');
        inputCol.className = 'journal-input-col';
        
        const entryArea = document.createElement('textarea');
        entryArea.className = 'journal-entry';
        entryArea.placeholder = "Write a line...";
        
        const storageKey = `kans-journal-${year}-${month + 1}-${day}`;
        const savedEntry = localStorage.getItem(storageKey);
        if (savedEntry) entryArea.value = savedEntry;

        entryArea.addEventListener('input', (e) => {
            localStorage.setItem(storageKey, e.target.value);
        });

        inputCol.appendChild(entryArea);
        
        rowDiv.appendChild(dateCol);
        rowDiv.appendChild(inputCol);
        container.appendChild(rowDiv);
    }

    if (todayElementId) {
        setTimeout(() => {
            const todayEl = document.getElementById(todayElementId);
            if(todayEl) {
                const y = todayEl.getBoundingClientRect().top + window.scrollY - 100;
                window.scrollTo({top: y, behavior: 'smooth'});
            }
        }, 100);
    } else {
        window.scrollTo(0, 0);
    }
}

async function exportLedger() {
    let journalEntries = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('kans-journal-')) {
            const datePart = key.replace('kans-journal-', '');
            const entry = localStorage.getItem(key);
            if (entry && entry.trim() !== '') {
                journalEntries.push({ date: datePart, content: entry });
            }
        }
    }

    if (journalEntries.length === 0) {
        alert("SYSTEM LOG: No journal entries found to export.");
        return;
    }

    journalEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

    let textOutput = "Nastavnik - Strategic Ledger Export\n";
    textOutput += "Generated on: " + new Date().toLocaleString() + "\n";
    textOutput += "=================================================\n\n";

    journalEntries.forEach(item => {
        textOutput += `[ DATE: ${item.date} ]\n`;
        textOutput += `${item.content}\n\n`;
        textOutput += `-------------------------------------------------\n\n`;
    });

    const defaultFileName = `Nastavnik_Ledger_${new Date().toISOString().split('T')[0]}.txt`;

    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: defaultFileName,
                types: [{ description: 'Text Document', accept: { 'text/plain': ['.txt'] } }]
            });
            const writable = await handle.createWritable(); 
            await writable.write(textOutput); 
            await writable.close(); 
            alert("LEDGER EXPORTED SUCCESSFULLY.");
        } else {
            const blob = new Blob([textOutput], { type: 'text/plain' });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = defaultFileName;
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    } catch (err) {
        console.error("Export cancelled or failed:", err);
    }
}