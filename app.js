/* ============================================= */
/*  ATTENDOMATE — Core Application Logic         */
/* ============================================= */

// ==================== State ====================
const APP_KEY = 'attendomate_data';
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIME_SLOTS = [
    '08:00–08:50', '09:00–09:50', '10:00–10:50', '11:00–11:50',
    '12:00–12:50', '13:00–13:50', '14:00–14:50', '15:00–15:50', '16:00–16:50'
];

let appState = {
    timetable: {},   // { Monday: ['24CSEN2031','MATH1341',...], ... }
    attendance: [],  // [{ code, name, present, total }, ...]
    holidays: []     // [{ date: 'YYYY-MM-DD', name: '' }, ...]
};

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
    loadState();
    initTabs();
    initTimetableUpload();
    initAttendanceUpload();
    initPredictor();
    initHolidays();
    initHeaderActions();
    renderDashboard();
    renderTimetableGrid();
    renderAttendanceTable();
    renderHolidaysList();
});

// ==================== Persistence ====================
function saveState() {
    localStorage.setItem(APP_KEY, JSON.stringify(appState));
}

function loadState() {
    try {
        const saved = localStorage.getItem(APP_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            appState.timetable = parsed.timetable || {};
            appState.attendance = parsed.attendance || [];
            appState.holidays = parsed.holidays || [];
        }
    } catch (e) {
        console.warn('Failed to load saved data:', e);
    }
}

// ==================== Tabs ====================
function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
            // Refresh relevant tab
            if (tabId === 'dashboard') renderDashboard();
            if (tabId === 'predictor') checkPredictorReady();
        });
    });
}

// ==================== Toast ====================
function showToast(message, type = 'info') {
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type]}"></i><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==================== Dashboard ====================
function renderDashboard() {
    const att = appState.attendance;
    if (!att || att.length === 0) {
        document.getElementById('overallPercent').textContent = '--';
        document.getElementById('overallRing').style.strokeDashoffset = 440;
        document.getElementById('overallStat').textContent = 'Upload attendance data to begin';
        document.getElementById('totalSubjects').textContent = '0';
        document.getElementById('totalPresent').textContent = '0';
        document.getElementById('totalClasses').textContent = '0';
        document.getElementById('dangerCount').textContent = '0';
        document.getElementById('subjectBars').innerHTML = '<p class="empty-msg">No attendance data yet. Go to the <strong>Attendance</strong> tab to upload your data.</p>';
        return;
    }

    let totalPresent = 0, totalClasses = 0, dangerCount = 0;
    att.forEach(s => {
        totalPresent += s.present;
        totalClasses += s.total;
        if (s.total > 0 && (s.present / s.total) * 100 < 75) dangerCount++;
    });

    const overallPct = totalClasses > 0 ? ((totalPresent / totalClasses) * 100) : 0;
    const circumference = 2 * Math.PI * 70; // r=70

    document.getElementById('overallPercent').textContent = overallPct.toFixed(1);
    const ring = document.getElementById('overallRing');
    const offset = circumference - (overallPct / 100) * circumference;
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = offset;

    // Color ring based on %
    if (overallPct >= 75) {
        ring.style.stroke = 'var(--success)';
    } else if (overallPct >= 65) {
        ring.style.stroke = 'var(--warning)';
    } else {
        ring.style.stroke = 'var(--danger)';
    }

    document.getElementById('overallStat').textContent = `${totalPresent} of ${totalClasses} classes attended`;
    document.getElementById('totalSubjects').textContent = att.length;
    document.getElementById('totalPresent').textContent = totalPresent;
    document.getElementById('totalClasses').textContent = totalClasses;
    document.getElementById('dangerCount').textContent = dangerCount;

    // Subject bars
    const barsHtml = att.map(s => {
        const pct = s.total > 0 ? ((s.present / s.total) * 100) : 0;
        let barClass = '';
        if (pct < 65) barClass = 'danger';
        else if (pct < 75) barClass = 'warning';
        return `
            <div class="subject-bar-item">
                <span class="subj-code" title="${s.name || s.code}">${s.code}</span>
                <div class="bar-track">
                    <div class="bar-fill ${barClass}" style="width: ${pct}%"></div>
                </div>
                <span class="bar-percent" style="color: ${pct < 65 ? 'var(--danger)' : pct < 75 ? 'var(--warning)' : 'var(--accent)'}">${pct.toFixed(0)}%</span>
            </div>
        `;
    }).join('');
    document.getElementById('subjectBars').innerHTML = barsHtml;
}

// ==================== Timetable ====================
function initTimetableUpload() {
    const zone = document.getElementById('timetableUploadZone');
    const fileInput = document.getElementById('timetableFileInput');
    const uploadBtn = document.getElementById('timetableUploadBtn');

    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    zone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) processTimetableImage(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) processTimetableImage(fileInput.files[0]);
    });

    // Save & clear
    document.getElementById('saveTimetableBtn').addEventListener('click', saveTimetableFromGrid);
    document.getElementById('clearTimetableBtn').addEventListener('click', () => {
        appState.timetable = {};
        saveState();
        renderTimetableGrid();
        renderDashboard();
        showToast('Timetable cleared', 'info');
    });

    // Manual editor
    document.getElementById('manualTimetableBtn').addEventListener('click', () => {
        document.getElementById('timetableGridCard').style.display = 'block';
        renderTimetableGrid();
        showToast('Manual editor opened — fill in subject codes', 'info');
    });
}

async function processTimetableImage(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('timetablePreviewImg').src = e.target.result;
        document.getElementById('timetablePreviewCard').style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Show progress
    const progressContainer = document.getElementById('timetableOcrProgress');
    const progressBar = document.getElementById('timetableProgressBar');
    const statusText = document.getElementById('timetableOcrStatus');
    progressContainer.style.display = 'block';

    try {
        statusText.textContent = 'Pre-processing image for better accuracy...';
        progressBar.style.width = '5%';

        // Pre-process image for better OCR accuracy
        const processedBlob = await preprocessImageForOCR(file);

        statusText.textContent = 'Initializing OCR engine...';
        progressBar.style.width = '15%';

        const worker = await Tesseract.createWorker('eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    progressBar.style.width = `${15 + pct * 0.7}%`;
                    statusText.textContent = `Recognizing text... ${pct}%`;
                }
            }
        });

        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
        });

        const { data } = await worker.recognize(processedBlob);
        progressBar.style.width = '90%';
        statusText.textContent = 'Parsing timetable...';

        console.log('[AttendoMate] Timetable OCR output:', data.text);
        const cleanedText = cleanOCRText(data.text);
        parseTimetableOCR(cleanedText);

        progressBar.style.width = '100%';
        statusText.textContent = 'Done! Review and edit below.';
        await worker.terminate();

        document.getElementById('timetableGridCard').style.display = 'block';
        renderTimetableGrid();
        showToast('Timetable extracted! Please review and correct any errors.', 'success');

        // Hide progress after a moment
        setTimeout(() => { progressContainer.style.display = 'none'; }, 2000);
    } catch (err) {
        console.error('OCR Error:', err);
        statusText.textContent = 'OCR failed. Try manual entry instead.';
        progressBar.style.width = '0%';
        showToast('OCR failed — please use manual entry', 'error');
        document.getElementById('timetableGridCard').style.display = 'block';
        renderTimetableGrid();
    }
}

function parseTimetableOCR(text) {
    // Try to parse lines of text into timetable structure
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const timetable = {};

    DAYS.forEach(day => { timetable[day] = new Array(TIME_SLOTS.length).fill(''); });

    // Look for day names and extract subject codes from each line
    const dayAliases = {
        'monday': 'Monday', 'mon': 'Monday',
        'tuesday': 'Tuesday', 'tue': 'Tuesday', 'tues': 'Tuesday',
        'wednesday': 'Wednesday', 'wed': 'Wednesday',
        'thursday': 'Thursday', 'thu': 'Thursday', 'thur': 'Thursday', 'thurs': 'Thursday',
        'friday': 'Friday', 'fri': 'Friday',
        'saturday': 'Saturday', 'sat': 'Saturday'
    };

    // Subject code pattern: letters followed by digits (e.g., 24CSEN2011, MATH1341)
    const subjectPattern = /\b[A-Z0-9]{4,}[A-Z0-9]*P?\b/gi;

    lines.forEach(line => {
        const lower = line.toLowerCase();
        let matchedDay = null;

        for (const [alias, day] of Object.entries(dayAliases)) {
            if (lower.startsWith(alias) || lower.includes(alias)) {
                matchedDay = day;
                break;
            }
        }

        if (matchedDay) {
            const codes = line.match(subjectPattern) || [];
            // Filter out common non-subject words
            const filtered = codes.filter(c => {
                const up = c.toUpperCase();
                return up.length >= 5 && !['WEEKDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].includes(up);
            });

            // Place codes into slots
            filtered.forEach((code, i) => {
                if (i < TIME_SLOTS.length) {
                    timetable[matchedDay][i] = code.toUpperCase();
                }
            });
        }
    });

    appState.timetable = timetable;
    saveState();
}

function renderTimetableGrid() {
    const tbody = document.getElementById('timetableBody');
    tbody.innerHTML = '';

    DAYS.forEach(day => {
        const tr = document.createElement('tr');
        // Day cell
        const dayTd = document.createElement('td');
        dayTd.textContent = day;
        tr.appendChild(dayTd);

        // Slot cells
        TIME_SLOTS.forEach((_, slotIdx) => {
            const td = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = '—';
            input.value = (appState.timetable[day] && appState.timetable[day][slotIdx]) || '';

            if (input.value) {
                td.classList.add(input.value.endsWith('P') ? 'lab-class' : 'has-class');
            }

            input.addEventListener('input', () => {
                const v = input.value.trim().toUpperCase();
                input.value = v;
                td.classList.remove('has-class', 'lab-class');
                if (v) td.classList.add(v.endsWith('P') ? 'lab-class' : 'has-class');
            });

            td.appendChild(input);
            tr.appendChild(td);
        });

        tbody.appendChild(tr);
    });
}

function saveTimetableFromGrid() {
    const rows = document.querySelectorAll('#timetableBody tr');
    const timetable = {};

    rows.forEach((row, dayIdx) => {
        const day = DAYS[dayIdx];
        const inputs = row.querySelectorAll('input');
        timetable[day] = [];
        inputs.forEach(input => {
            timetable[day].push(input.value.trim().toUpperCase());
        });
    });

    appState.timetable = timetable;
    saveState();
    renderDashboard();
    showToast('Timetable saved successfully!', 'success');
}

// ==================== Attendance ====================
function initAttendanceUpload() {
    const zone = document.getElementById('attendanceUploadZone');
    const fileInput = document.getElementById('attendanceFileInput');
    const uploadBtn = document.getElementById('attendanceUploadBtn');

    uploadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fileInput.click();
    });
    zone.addEventListener('click', () => fileInput.click());

    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        if (e.dataTransfer.files.length) processAttendanceImage(e.dataTransfer.files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) processAttendanceImage(fileInput.files[0]);
    });

    document.getElementById('saveAttendanceBtn').addEventListener('click', saveAttendanceFromTable);
    document.getElementById('addSubjectBtn').addEventListener('click', addEmptySubjectRow);
    document.getElementById('manualAttendanceBtn').addEventListener('click', () => {
        document.getElementById('attendanceTableCard').style.display = 'block';
        if (appState.attendance.length === 0) addEmptySubjectRow();
        showToast('Manual editor opened — enter your attendance data', 'info');
    });
}

async function processAttendanceImage(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please upload an image file', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('attendancePreviewImg').src = e.target.result;
        document.getElementById('attendancePreviewCard').style.display = 'block';
    };
    reader.readAsDataURL(file);

    const progressContainer = document.getElementById('attendanceOcrProgress');
    const progressBar = document.getElementById('attendanceProgressBar');
    const statusText = document.getElementById('attendanceOcrStatus');
    progressContainer.style.display = 'block';

    try {
        statusText.textContent = 'Pre-processing image...';
        progressBar.style.width = '5%';

        const processedBlob = await preprocessImageForOCR(file);

        statusText.textContent = 'Initializing OCR engine...';
        progressBar.style.width = '15%';

        const worker = await Tesseract.createWorker('eng', 1, {
            logger: (m) => {
                if (m.status === 'recognizing text') {
                    const pct = Math.round(m.progress * 100);
                    progressBar.style.width = `${15 + pct * 0.7}%`;
                    statusText.textContent = `Recognizing text... ${pct}%`;
                }
            }
        });

        await worker.setParameters({
            tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
            preserve_interword_spaces: '1',
        });

        const { data } = await worker.recognize(processedBlob);
        progressBar.style.width = '90%';
        statusText.textContent = 'Parsing attendance data...';

        console.log('[AttendoMate] Raw OCR text:', data.text);

        // Strategy 1: Try structured word-level parsing (most accurate)
        let parsed = parseAttendanceStructured(data);
        console.log(`[AttendoMate] Structured parser found ${parsed.length} subjects`);

        // Strategy 2: Fall back to text-based parsing if structured got few results
        if (parsed.length < 5) {
            const cleanedText = cleanOCRText(data.text);
            console.log('[AttendoMate] Cleaned text:', cleanedText);
            parseAttendanceOCR(cleanedText);
            console.log(`[AttendoMate] Text parser found ${appState.attendance.length} subjects`);

            // Use whichever found more subjects
            if (parsed.length > appState.attendance.length) {
                appState.attendance = parsed;
                saveState();
            }
        } else {
            appState.attendance = parsed;
            saveState();
        }

        progressBar.style.width = '100%';
        statusText.textContent = 'Done! Review and edit below.';
        await worker.terminate();

        document.getElementById('attendanceTableCard').style.display = 'block';
        renderAttendanceTable();
        renderDashboard();
        showToast('Attendance extracted! Please review and correct any errors.', 'success');

        setTimeout(() => { progressContainer.style.display = 'none'; }, 2000);
    } catch (err) {
        console.error('OCR Error:', err);
        statusText.textContent = 'OCR failed. Try manual entry instead.';
        progressBar.style.width = '0%';
        showToast('OCR failed — please use manual entry', 'error');
        document.getElementById('attendanceTableCard').style.display = 'block';
        if (appState.attendance.length === 0) addEmptySubjectRow();
    }
}

// Pre-process image: upscale 2x + grayscale + gentle contrast (NO hard B/W threshold!)
function preprocessImageForOCR(file) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            // Increase scale to 3x for even better character separation
            const scale = 3;
            const canvas = document.createElement('canvas');
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');

            // Draw with sharpening filters
            ctx.filter = 'grayscale(100%) contrast(150%) brightness(105%)';
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            // Manual Sharpening Filter (3x3 convolution)
            // This helps significantly with separating digits like '11'
            try {
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;
                const width = imageData.width;
                const height = imageData.height;
                const output = new Uint8ClampedArray(data.length);

                // Sharpening kernel: [0, -1, 0, -1, 5, -1, 0, -1, 0]
                const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];
                const weight = 1;

                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        let r = 0, g = 0, b = 0;
                        for (let ky = -1; ky <= 1; ky++) {
                            for (let kx = -1; kx <= 1; kx++) {
                                const idx = ((y + ky) * width + (x + kx)) * 4;
                                const kVal = kernel[(ky + 1) * 3 + (kx + 1)];
                                r += data[idx] * kVal;
                                g += data[idx + 1] * kVal;
                                b += data[idx + 2] * kVal;
                            }
                        }
                        const outIdx = (y * width + x) * 4;
                        output[outIdx] = Math.max(0, Math.min(255, r / weight));
                        output[outIdx + 1] = Math.max(0, Math.min(255, g / weight));
                        output[outIdx + 2] = Math.max(0, Math.min(255, b / weight));
                        output[outIdx + 3] = data[outIdx + 3];
                    }
                }
                ctx.putImageData(new ImageData(output, width, height), 0, 0);
            } catch (e) {
                console.warn('[AttendoMate] Sharpening failed:', e);
                // Continue with just the filtered image if sharpening fails
            }

            canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Failed')), 'image/png');
        };
        img.onerror = reject;
        const fr = new FileReader();
        fr.onload = (e) => { img.src = e.target.result; };
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });
}

// Parse attendance using Tesseract's structured word data (with bounding boxes)
function parseAttendanceStructured(ocrData) {
    const attendance = [];
    const seenCodes = new Set();
    const codeRegex = /^\d{0,2}[A-Z]{2,}[A-Z0-9]*\d{3,}P?$/i;

    // Flatten all lines from Tesseract's block → paragraph → line structure
    const allLines = [];
    try {
        if (ocrData.blocks) {
            for (const block of ocrData.blocks) {
                for (const para of (block.paragraphs || [])) {
                    for (const line of (para.lines || [])) {
                        allLines.push(line);
                    }
                }
            }
        }
    } catch (e) {
        console.warn('[AttendoMate] Could not read structured data:', e);
        return [];
    }

    if (allLines.length === 0) return [];

    // Step 1: Find "Present" and "Total" header words to get column x-positions
    let presentColX = null, totalColX = null, pctColX = null;

    for (const line of allLines) {
        const lineText = (line.words || []).map(w => w.text).join(' ').toLowerCase();
        if (!lineText.includes('present') && !lineText.includes('total')) continue;

        for (const word of (line.words || [])) {
            const t = word.text.toLowerCase();
            const cx = (word.bbox.x0 + word.bbox.x1) / 2;
            if (t === 'present' || t.startsWith('present')) presentColX = cx;
            if (t === 'total' || t.startsWith('total')) totalColX = cx;
            if (t.startsWith('percent') || t.startsWith('perce') || t === '%') pctColX = cx;
        }
        if (presentColX && totalColX) break;
    }

    const hasColumns = !!(presentColX && totalColX);
    console.log(`[AttendoMate] Column detection: present_x=${presentColX}, total_x=${totalColX}, pct_x=${pctColX}`);

    // Step 2: Parse each line
    for (const line of allLines) {
        const words = line.words || [];
        if (words.length === 0) continue;

        const lineText = words.map(w => w.text).join(' ');

        // Skip header rows
        if (/subject\s*code|subject\s*name|\bpresent\b|\btotal\b|percentage|sl\.?\s*no/i.test(lineText)) continue;

        // Find subject code word (or adjacent words that form a code)
        let codeWord = null;
        let codeWordIdx = -1;
        for (let i = 0; i < words.length; i++) {
            let w = words[i].text.toUpperCase().replace(/[^A-Z0-9]/g, '');

            // Try current word
            if (codeRegex.test(w) && w.length >= 5) {
                if (!/^(WEEKDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|TOTAL|PRESENT|ABSENT)$/.test(w)) {
                    codeWord = w;
                    codeWordIdx = i;
                    break;
                }
            }

            // Try merging with next word (if split)
            if (i < words.length - 1) {
                let nextW = words[i + 1].text.toUpperCase().replace(/[^A-Z0-9]/g, '');
                let merged = w + nextW;
                if (codeRegex.test(merged) && merged.length >= 5) {
                    codeWord = merged;
                    codeWordIdx = i + 1;
                    break;
                }
            }
        }

        if (!codeWord || seenCodes.has(codeWord)) continue;

        // Extract subject name and hunt for numbers (merged numbers are common)
        let name = '';
        let firstNumWordIdx = -1;
        for (let i = codeWordIdx + 1; i < words.length; i++) {
            const text = words[i].text;
            // Catch clusters like "13Operating" or "15Database"
            if (/[0-9lIOo]{1,3}[A-Z]{2,}/i.test(text) || /[A-Z]{2,}[0-9lIOo]{1,3}/i.test(text) || /^[0-9lIOo]{1,3}$/.test(text)) {
                if (firstNumWordIdx === -1) firstNumWordIdx = i;
                break;
            }
            name += (name ? ' ' : '') + text;
        }
        if (firstNumWordIdx === -1) firstNumWordIdx = words.length;

        // Extract numbers using column positions when available
        let present = null, total = null;

        if (hasColumns) {
            // Use x-position to map numbers to columns
            const colGap = Math.abs(totalColX - presentColX);
            const tolerance = colGap * 0.45;

            const rowNums = [];
            for (let i = firstNumWordIdx; i < words.length; i++) {
                let text = words[i].text;
                // Aggressively extract all numeric clusters from the word
                let matches = text.match(/[0-9lIOo]{1,4}/g);
                if (!matches) continue;

                for (let match of matches) {
                    let numStr = match.replace(/[lI]/g, '1').replace(/[Oo]/g, '0');
                    const num = parseInt(numStr);
                    const cx = (words[i].bbox.x0 + words[i].bbox.x1) / 2;
                    rowNums.push({ val: num, cx: cx });

                    const dPresent = Math.abs(cx - presentColX);
                    const dTotal = Math.abs(cx - totalColX);
                    const dPct = pctColX ? Math.abs(cx - pctColX) : Infinity;

                    // If columns are detected, be precise. Otherwise fallback will handle it.
                    if (dPct < dPresent && dPct < dTotal && dPct < (totalColX - presentColX) * 0.4) continue;

                    if (dPresent < dTotal && dPresent < tolerance && present === null) {
                        present = num;
                    } else if (dTotal <= dPresent && dTotal < tolerance && total === null) {
                        total = num;
                    }
                }
            }

            // Fallback: horizontal ordering if structural mapping missed something
            if ((present === null || total === null) && rowNums.length > 0) {
                rowNums.sort((a, b) => a.cx - b.cx);
                if (rowNums.length >= 2) {
                    present = rowNums[0].val;
                    total = rowNums[1].val;
                } else if (rowNums.length === 1) {
                    total = rowNums[0].val;
                }
            }
        } else {
            // No column positions — use natural left-to-right ordering
            const nums = [];
            for (let i = firstNumWordIdx; i < words.length; i++) {
                const numStr = words[i].text.replace(/[^0-9]/g, '');
                if (numStr && numStr.length >= 1 && numStr.length <= 4) {
                    nums.push(parseInt(numStr));
                }
            }

            if (nums.length >= 2) {
                present = nums[0];
                total = nums[1];
            } else if (nums.length === 1) {
                present = 0;
                total = nums[0];
            }
        }

        if (total === null || total <= 0) continue;
        if (present === null) present = 0;
        if (present > total) [present, total] = [total, present];

        const pct = (present / total * 100).toFixed(1);
        console.log(`[AttendoMate] STRUCT ${codeWord}: present=${present}, total=${total}, %=${pct}%`);

        seenCodes.add(codeWord);
        attendance.push({ code: codeWord, name: name.trim() || codeWord, present, total });
    }

    attendance.sort((a, b) => a.code.localeCompare(b.code));
    return attendance;
}

// Clean up common OCR misreads in text
function cleanOCRText(text) {
    let cleaned = text;

    // Fix dashes/hyphens adjacent to digits
    cleaned = cleaned.replace(/(\d)[-–—](\d)/g, '$1$2');
    cleaned = cleaned.replace(/(\d)[-–—]\s/g, '$1 ');
    cleaned = cleaned.replace(/(\d)[-–—]$/gm, '$1');
    cleaned = cleaned.replace(/\s[-–—](\d)/g, ' $1');
    cleaned = cleaned.replace(/^[-–—](\d)/gm, '$1');

    // Fix common letter→digit misreads in number contexts
    cleaned = cleaned.replace(/(\d)[Oo](\d)/g, '$10$2');
    cleaned = cleaned.replace(/(\d)[lI](\d)/g, '$11$2');
    cleaned = cleaned.replace(/(\d)[Oo]\b/g, '$10');
    cleaned = cleaned.replace(/\b[Oo](\d)/g, '0$1');

    // Remove stray special characters
    cleaned = cleaned.replace(/(\d)[.,;:]+\s/g, '$1 ');
    cleaned = cleaned.replace(/(\d)\|(\d)/g, '$1 $2');
    cleaned = cleaned.replace(/\|/g, ' ');

    return cleaned;
}

function parseAttendanceOCR(text) {
    // Clean up common OCR artifacts before parsing
    let cleanedText = text
        .replace(/[''`]/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

    const lines = cleanedText.split('\n').map(l => l.trim()).filter(l => l.length > 2);
    const attendance = [];
    const seenCodes = new Set();

    // Robust subject code pattern — matches codes like 24CSEN2011, EECE3621, MATH1341, GCGC1011, ENVS1003, 24CSEN2031P
    const codePatterns = [
        /\b(\d{0,2}[A-Z]{2,}[A-Z0-9]*\d{3,}P?)\b/gi,   // e.g. 24CSEN2011, MATH1341, EECE3621
        /\b([A-Z]{2,}\d{4,}P?)\b/gi,                      // e.g. MATH1341, ENVS1003
        /\b(\d{2}[A-Z]{3,}\d{4}P?)\b/gi,                  // e.g. 24CSEN2011P
    ];

    // Header keywords to skip
    const headerKeywords = /subject\s*code|subject\s*name|^present$|^total$|percentage|sl\.?\s*no|s\.?\s*no/i;

    // Extract all numbers from a string, returning them in order of appearance
    function extractNumbers(str) {
        const nums = [];
        const regex = /\b(\d{1,4})\b/g;
        let m;
        while ((m = regex.exec(str)) !== null) {
            nums.push({ value: parseInt(m[1]), index: m.index });
        }
        return nums;
    }

    // Find subject code in a line using multiple patterns
    function findSubjectCode(line) {
        for (const pattern of codePatterns) {
            pattern.lastIndex = 0;
            const allMatches = [];
            let m;
            while ((m = pattern.exec(line)) !== null) {
                const candidate = m[1].toUpperCase();
                // Filter out words that are clearly not subject codes
                if (candidate.length >= 5 &&
                    !/^(WEEKDAY|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|TOTAL|PRESENT|PERCENTAGE)$/i.test(candidate)) {
                    allMatches.push({ code: candidate, index: m.index, length: m[0].length });
                }
            }
            if (allMatches.length > 0) return allMatches[0];
        }
        return null;
    }

    // Determine present, total, percentage from a list of numbers using cross-validation
    function classifyNumbers(nums) {
        if (nums.length === 0) return null;

        // Get just the values
        const values = nums.map(n => n.value);

        if (values.length >= 3) {
            // Try natural column order first with the FIRST 3 numbers (Present, Total, Percentage)
            const first3 = values.slice(0, 3);
            const bestFit1 = findBestPTPercent(first3);
            if (bestFit1) return bestFit1;

            // If more than 3 numbers, also try the last 3 (maybe first ones are noise)
            if (values.length > 3) {
                const last3 = values.slice(-3);
                const bestFit2 = findBestPTPercent(last3);
                if (bestFit2) return bestFit2;
            }

            // Last resort: assume first two are present, total
            if (first3[0] <= first3[1] && first3[1] > 0) {
                return { present: first3[0], total: first3[1] };
            }
            return { present: first3[0], total: first3[1] };
        }

        if (values.length === 2) {
            let [a, b] = values;

            // Two numbers could be:
            //   Case A: [present, total]       — most common, natural order
            //   Case B: [present, percentage]  — OCR dropped the Total column
            //   Case C: [total, percentage]    — OCR dropped the Present column (rare)

            // Try Case A: [present, total]
            let caseA_valid = false;
            if (a <= b && b > 0) {
                caseA_valid = true;
            }

            // Try Case B: [present, percentage] — infer total from percentage
            let caseB_valid = false;
            let caseB_total = 0;
            if (b > 0 && b <= 100) {
                // If b is the percentage: total = round(present * 100 / percentage)
                caseB_total = Math.round(a * 100 / b);
                if (caseB_total >= a && caseB_total > 0) {
                    // Verify: does round(present / inferred_total * 100) == b?
                    const checkPct = Math.round(a / caseB_total * 100);
                    if (Math.abs(checkPct - b) <= 1) {
                        caseB_valid = true;
                    }
                }
            }

            // Decide between Case A and Case B
            if (caseA_valid && caseB_valid) {
                // Both are valid — need a tiebreaker
                // If b is much larger than a (ratio > 3), b is likely a percentage, not total
                // Because in attendance, total is usually close to present
                // e.g., [8, 88]: as total → 9%, as percentage → total=9, 88% — clearly b is percentage
                // e.g., [28, 31]: as total → 90%, as percentage → total=90 → 31% — b is total
                if (b > a * 3 && b <= 100) {
                    // b is almost certainly the percentage (e.g., [8, 88], [16, 100])
                    return { present: a, total: caseB_total };
                }
                // If ratio is reasonable, b is likely the total (e.g., [20, 24], [28, 31])
                return { present: a, total: b };
            }

            if (caseB_valid) {
                return { present: a, total: caseB_total };
            }

            if (caseA_valid) {
                return { present: a, total: b };
            }

            // Neither case validated cleanly — just use natural order
            if (a <= b) return { present: a, total: b };
            return { present: b, total: a };
        }

        if (values.length === 1) {
            // Single number — not enough data
            return { present: 0, total: values[0] };
        }

        return null;
    }

    // Find (present, total) from 3 numbers, prioritizing natural column order: Present, Total, Percentage
    function findBestPTPercent(nums) {
        const [a, b, c] = nums;

        // PRIORITY 1: Natural column order — present=a, total=b, pct=c
        // This is the standard layout in college portals: Present | Total | Percentage
        if (a <= b && b > 0 && c >= 0 && c <= 100) {
            const expectedPct = Math.round((a / b) * 100);
            if (Math.abs(expectedPct - c) <= 3) {
                return { present: a, total: b };
            }
        }

        // PRIORITY 2: Sometimes percentage comes as an integer that's larger than total
        // (e.g., for 100% it might be 100), or columns might be slightly reordered
        // Try other orderings but only as fallback
        const candidates = [
            { present: a, total: c, pct: b, priority: 1 },
            { present: b, total: c, pct: a, priority: 2 },
            { present: b, total: a, pct: c, priority: 2 },
            { present: c, total: a, pct: b, priority: 3 },
            { present: c, total: b, pct: a, priority: 3 },
        ];

        let bestCandidate = null;
        let bestError = Infinity;
        let bestPriority = Infinity;

        for (const cand of candidates) {
            if (cand.present > cand.total) continue;
            if (cand.total === 0) continue;
            if (cand.pct < 0 || cand.pct > 100) continue;

            const expectedPct = Math.round((cand.present / cand.total) * 100);
            const error = Math.abs(expectedPct - cand.pct);

            if (error <= 3) {
                // Prefer lower priority number (higher priority), then lower error
                if (cand.priority < bestPriority || (cand.priority === bestPriority && error < bestError)) {
                    bestError = error;
                    bestPriority = cand.priority;
                    bestCandidate = { present: cand.present, total: cand.total };
                }
            }
        }

        if (bestCandidate) return bestCandidate;

        // FALLBACK: assume first two are present, total (natural order)
        if (a <= b && b > 0) return { present: a, total: b };
        if (b <= a && a > 0) return { present: b, total: a };

        return null;
    }

    // Extract subject name from the text between code and numbers
    function extractName(line, codeEndIdx) {
        const afterCode = line.substring(codeEndIdx);
        const firstNumIdx = afterCode.search(/\d/);
        if (firstNumIdx > 0) {
            let name = afterCode.substring(0, firstNumIdx)
                .replace(/[|[\]{}]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            // Remove leading/trailing special chars
            name = name.replace(/^[^a-zA-Z]+/, '').replace(/[^a-zA-Z)]+$/, '').trim();
            return name;
        }
        return '';
    }

    // ===== MAIN PARSING LOOP =====
    lines.forEach((line, lineIdx) => {
        // Skip header rows
        if (headerKeywords.test(line)) return;

        // Skip lines that are just numbers or very short
        if (/^\d+$/.test(line.replace(/\s/g, ''))) return;

        const codeResult = findSubjectCode(line);
        if (!codeResult) return;

        const code = codeResult.code;

        // Skip if we already extracted this subject
        if (seenCodes.has(code)) return;

        // Extract name
        const name = extractName(line, codeResult.index + codeResult.length);

        // Extract all numbers AFTER the subject code
        const afterCodeStr = line.substring(codeResult.index + codeResult.length);
        const nums = extractNumbers(afterCodeStr);

        // Also try extracting numbers from the entire line (OCR might split things)
        let allNums = nums;
        if (nums.length < 2) {
            // Maybe numbers are on the next line or merged weirdly — try full line
            allNums = extractNumbers(line);
            // Remove numbers that are part of the subject code itself
            const codeNums = extractNumbers(code);
            const codeNumValues = new Set(codeNums.map(n => n.value));
            // Only filter if there are potential conflicts
            if (allNums.length > nums.length) {
                allNums = allNums.filter(n => n.index > codeResult.index + codeResult.length - 1);
            }
        }

        // Filter out numbers that are clearly part of subject code prefix (like '24' in '24CSEN2011')
        const relevantNums = allNums.filter(n => {
            // Skip single-digit or two-digit numbers that appear before meaningful data
            // Keep numbers that are likely present/total/percentage
            return true; // Let classifyNumbers handle the logic
        });

        const classified = classifyNumbers(relevantNums);
        if (!classified) return;

        let { present, total } = classified;

        // Final validation
        if (total <= 0) return;
        if (present < 0) present = 0;
        if (present > total) {
            // Swap if they got reversed
            [present, total] = [total, present];
        }

        const pct = total > 0 ? (present / total * 100).toFixed(1) : '0.0';
        console.log(`[AttendoMate] ${code}: numbers=[${relevantNums.map(n => n.value)}] → present=${present}, total=${total}, calc%=${pct}%  |  line: "${line.substring(0, 80)}"`);

        seenCodes.add(code);
        attendance.push({
            code,
            name: name || code,
            present,
            total
        });
    });

    // ===== SECOND PASS: look for subjects we might have missed =====
    // Sometimes OCR splits a row across multiple lines — try merging consecutive non-header lines
    if (attendance.length < 5) {
        const mergedLines = [];
        let currentMerge = '';
        lines.forEach(line => {
            if (headerKeywords.test(line)) {
                if (currentMerge) mergedLines.push(currentMerge);
                currentMerge = '';
                return;
            }
            // If this line starts with a potential subject code, start a new merge
            const hasCode = findSubjectCode(line);
            if (hasCode && currentMerge) {
                mergedLines.push(currentMerge);
                currentMerge = line;
            } else {
                currentMerge = currentMerge ? currentMerge + ' ' + line : line;
            }
        });
        if (currentMerge) mergedLines.push(currentMerge);

        // Re-parse merged lines for any codes we missed
        mergedLines.forEach(line => {
            const codeResult = findSubjectCode(line);
            if (!codeResult) return;
            if (seenCodes.has(codeResult.code)) return;

            const afterCodeStr = line.substring(codeResult.index + codeResult.length);
            const nums = extractNumbers(afterCodeStr);
            const classified = classifyNumbers(nums);
            if (!classified || classified.total <= 0) return;

            let { present, total } = classified;
            if (present > total) [present, total] = [total, present];

            const name = extractName(line, codeResult.index + codeResult.length);
            seenCodes.add(codeResult.code);
            attendance.push({ code: codeResult.code, name: name || codeResult.code, present, total });
        });
    }

    // Sort by code for consistent ordering
    attendance.sort((a, b) => a.code.localeCompare(b.code));

    if (attendance.length > 0) {
        appState.attendance = attendance;
        saveState();
        console.log(`[AttendoMate] Parsed ${attendance.length} subjects:`, attendance);
    } else {
        showToast('Could not parse attendance data. Please enter manually.', 'warning');
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceBody');
    tbody.innerHTML = '';

    if (appState.attendance.length === 0) return;

    document.getElementById('attendanceTableCard').style.display = 'block';

    appState.attendance.forEach((subj, idx) => {
        const pct = subj.total > 0 ? ((subj.present / subj.total) * 100) : 0;
        let statusClass = 'safe', statusText = 'Safe';
        if (pct < 65) { statusClass = 'danger'; statusText = 'Critical'; }
        else if (pct < 75) { statusClass = 'warning'; statusText = 'Warning'; }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" value="${subj.code}" data-idx="${idx}" data-field="code"></td>
            <td><input type="text" value="${subj.name}" data-idx="${idx}" data-field="name"></td>
            <td><input type="number" value="${subj.present}" min="0" data-idx="${idx}" data-field="present"></td>
            <td><input type="number" value="${subj.total}" min="0" data-idx="${idx}" data-field="total"></td>
            <td class="percent-cell" style="color: ${pct < 65 ? 'var(--danger)' : pct < 75 ? 'var(--warning)' : 'var(--success)'}">${pct.toFixed(1)}%</td>
            <td class="status-cell">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </td>
            <td><button class="delete-row-btn" data-idx="${idx}" title="Remove"><i class="fas fa-times"></i></button></td>
        `;

        // Update percentage on input change
        tr.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', () => {
                const i = parseInt(input.dataset.idx);
                const field = input.dataset.field;
                if (field === 'present' || field === 'total') {
                    appState.attendance[i][field] = parseInt(input.value) || 0;
                } else {
                    appState.attendance[i][field] = input.value;
                }
                renderAttendanceTable();
            });
        });

        // Delete button
        tr.querySelector('.delete-row-btn').addEventListener('click', () => {
            appState.attendance.splice(idx, 1);
            saveState();
            renderAttendanceTable();
            renderDashboard();
            showToast('Subject removed', 'info');
        });

        tbody.appendChild(tr);
    });
}

function addEmptySubjectRow() {
    appState.attendance.push({ code: '', name: '', present: 0, total: 0 });
    document.getElementById('attendanceTableCard').style.display = 'block';
    renderAttendanceTable();
}

function saveAttendanceFromTable() {
    // Data is already synced via input change events, but let's do a final read
    const rows = document.querySelectorAll('#attendanceBody tr');
    const attendance = [];

    rows.forEach(row => {
        const inputs = row.querySelectorAll('input');
        const code = inputs[0].value.trim();
        const name = inputs[1].value.trim();
        const present = parseInt(inputs[2].value) || 0;
        const total = parseInt(inputs[3].value) || 0;

        if (code || name) {
            attendance.push({ code, name: name || code, present, total });
        }
    });

    appState.attendance = attendance;
    saveState();
    renderDashboard();
    renderAttendanceTable();
    showToast('Attendance saved successfully!', 'success');
}

// ==================== Predictor ====================
function initPredictor() {
    // Set default date to today
    const dateInput = document.getElementById('boostStartDate');
    if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // Drop buttons
    document.querySelectorAll('#dropDaySelector .day-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#dropDaySelector .day-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calculatePrediction(btn.dataset.day);
        });
    });

    // Booster button
    document.getElementById('calculateBoostBtn').addEventListener('click', () => {
        const startDate = document.getElementById('boostStartDate').value;
        const count = parseInt(document.getElementById('boostCount').value) || 1;
        if (!startDate) {
            showToast('Please select a starting date', 'warning');
            return;
        }
        calculateBoost(startDate, count);
    });
}

function checkPredictorReady() {
    const hasTimetable = Object.keys(appState.timetable).length > 0 &&
        Object.values(appState.timetable).some(slots => slots.some(s => s));
    const hasAttendance = appState.attendance.length > 0;

    document.getElementById('predictorEmpty').style.display = (hasTimetable && hasAttendance) ? 'none' : 'block';
}

function calculatePrediction(day) {
    renderPredictionResults(day, 1, 'drop');
}

function calculateBoost(startDay, count) {
    renderPredictionResults(startDay, count, 'boost');
}

function renderPredictionResults(anchor, count, mode) {
    const att = appState.attendance;
    if (att.length === 0) {
        showToast('Need attendance data for predictions', 'warning');
        return;
    }

    const classesToModify = {}; // { subjectCode: count }

    if (mode === 'drop') {
        const dayName = anchor; // anchor is day name (Monday...)
        const tt = appState.timetable[dayName] || [];
        tt.forEach(code => {
            if (code) {
                const upper = code.toUpperCase();
                classesToModify[upper] = (classesToModify[upper] || 0) + 1;
            }
        });
    } else {
        // Booster mode: find next 'count' working days starting from date 'anchor'
        let date = new Date(anchor);
        let daysFound = 0;
        let iterations = 0;
        const maxIterations = 100; // Safety cap

        while (daysFound < count && iterations < maxIterations) {
            iterations++;
            const dayOfWeek = date.getDay(); // 0 is Sun, 6 is Sat
            const dateStr = date.toISOString().split('T')[0];
            const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
            const isMarkedHoliday = appState.holidays.some(h => h.date === dateStr);

            if (!isWeekend && !isMarkedHoliday) {
                const dayName = DAYS[dayOfWeek === 0 ? 6 : dayOfWeek - 1]; // Convert 1-5 to Mon-Fri (since 0 is Sun)
                const tt = appState.timetable[dayName] || [];
                tt.forEach(code => {
                    if (code) {
                        const upper = code.toUpperCase();
                        classesToModify[upper] = (classesToModify[upper] || 0) + 1;
                    }
                });
                daysFound++;
            }

            // Move to next calendar day
            date.setDate(date.getDate() + 1);
        }
    }

    const breakdown = [];
    let totalPresent = 0, totalClasses = 0;
    let newTotalPresent = 0, newTotalClasses = 0;

    att.forEach(subj => {
        const code = subj.code.toUpperCase();
        const currentPct = subj.total > 0 ? (subj.present / subj.total) * 100 : 0;
        const extraClasses = classesToModify[code] || 0;

        let newTotal = subj.total + extraClasses;
        let newPresent = subj.present;

        if (mode === 'boost') {
            newPresent = subj.present + extraClasses; // Student attends all booster classes
        }
        // In 'drop' mode, newPresent remains same (misses the classes)

        const newPct = newTotal > 0 ? (newPresent / newTotal) * 100 : 0;
        const change = newPct - currentPct;

        totalPresent += subj.present;
        totalClasses += subj.total;
        newTotalPresent += newPresent;
        newTotalClasses += newTotal;

        breakdown.push({
            code: subj.code,
            name: subj.name,
            currentPct,
            newPct,
            change,
            extraClasses
        });
    });

    const overallCurrent = totalClasses > 0 ? (totalPresent / totalClasses) * 100 : 0;
    const overallNew = newTotalClasses > 0 ? (newTotalPresent / newTotalClasses) * 100 : 0;
    const overallDrop = overallCurrent - overallNew;

    // Render results
    document.getElementById('predictionResults').style.display = 'block';
    document.getElementById('predictorEmpty').style.display = 'none';

    document.getElementById('predCurrent').textContent = overallCurrent.toFixed(1) + '%';
    document.getElementById('predNew').textContent = overallNew.toFixed(1) + '%';

    const changeVal = overallNew - overallCurrent;
    const changeText = (changeVal >= 0 ? '+' : '−') + Math.abs(changeVal).toFixed(2) + '%';
    document.getElementById('predDrop').textContent = changeText;
    document.getElementById('predDrop').className = `pred-value ${changeVal >= 0 ? 'success' : 'danger'}`;

    const label = document.querySelector('.prediction-header .pred-stat.drop .pred-label');
    label.textContent = mode === 'drop' ? 'After Skipping' : 'After Attending';

    const breakdownHtml = breakdown.map(item => {
        const barColor = item.newPct < 65 ? 'var(--danger)' : item.newPct < 75 ? 'var(--warning)' : 'var(--accent)';
        const changeText = (item.change >= 0 ? '+' : '−') + Math.abs(item.change).toFixed(2) + '%';
        const changeColor = item.change > 0 ? 'var(--success)' : (item.change < 0 ? 'var(--danger)' : 'var(--text-muted)');
        const extraInfo = item.extraClasses > 0 ? `+${item.extraClasses} class${item.extraClasses > 1 ? 'es' : ''}` : 'No class';

        return `
            <div class="pred-item">
                <span class="subj-code" title="${item.name}">${item.code}</span>
                <div class="pred-bar">
                    <div class="pred-bar-fill" style="width: ${item.newPct}%; background: ${barColor};"></div>
                </div>
                <span class="pred-current" style="color: var(--text-secondary)">${item.currentPct.toFixed(1)}%</span>
                <span class="pred-new" style="color: ${barColor}">${item.newPct.toFixed(1)}%</span>
                <span class="pred-drop" style="color: ${changeColor}">${changeText}</span>
            </div>
        `;
    }).join('');

    document.getElementById('predictionBreakdown').innerHTML =
        `<div style="display:grid; grid-template-columns: 140px 1fr 80px 80px 60px; gap:12px; padding:4px 14px; margin-bottom:4px;">
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">SUBJECT</span>
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;">NEW ATTENDANCE</span>
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">CURRENT</span>
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">AFTER</span>
            <span style="font-size:0.72rem;color:var(--text-muted);font-weight:600;text-align:center;">CHANGE</span>
        </div>` + breakdownHtml;
}

// ==================== Holidays ====================
function initHolidays() {
    document.getElementById('addHolidayBtn').addEventListener('click', addHoliday);
}

function addHoliday() {
    const dateInput = document.getElementById('holidayDate');
    const nameInput = document.getElementById('holidayName');

    if (!dateInput.value) {
        showToast('Please select a date', 'warning');
        return;
    }

    // Check duplicate
    if (appState.holidays.some(h => h.date === dateInput.value)) {
        showToast('This date is already marked as a holiday', 'warning');
        return;
    }

    appState.holidays.push({
        date: dateInput.value,
        name: nameInput.value.trim() || 'Holiday'
    });

    // Sort by date
    appState.holidays.sort((a, b) => a.date.localeCompare(b.date));
    saveState();
    renderHolidaysList();
    dateInput.value = '';
    nameInput.value = '';
    showToast('Holiday added!', 'success');
}

function renderHolidaysList() {
    const container = document.getElementById('holidaysList');

    if (appState.holidays.length === 0) {
        container.innerHTML = '<p class="empty-msg">No holidays marked yet.</p>';
        return;
    }

    container.innerHTML = appState.holidays.map((h, idx) => {
        const d = new Date(h.date + 'T00:00:00');
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long' });
        const formatted = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

        return `
            <div class="holiday-item">
                <div class="holiday-info">
                    <i class="fas fa-calendar-times"></i>
                    <div>
                        <span class="holiday-date">${formatted}</span>
                        <span class="holiday-name"> — ${h.name}</span>
                        <br><span class="holiday-day">${dayName}</span>
                    </div>
                </div>
                <button class="holiday-delete" data-idx="${idx}" title="Remove">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;
    }).join('');

    // Delete handlers
    container.querySelectorAll('.holiday-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx);
            appState.holidays.splice(idx, 1);
            saveState();
            renderHolidaysList();
            showToast('Holiday removed', 'info');
        });
    });
}

// ==================== Header Actions ====================
function initHeaderActions() {
    // Export
    document.getElementById('exportBtn').addEventListener('click', () => {
        const data = JSON.stringify(appState, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'attendomate_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('Data exported!', 'success');
    });

    // Import
    document.getElementById('importBtn').addEventListener('click', () => {
        document.getElementById('importFileInput').click();
    });

    document.getElementById('importFileInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                appState.timetable = data.timetable || {};
                appState.attendance = data.attendance || [];
                appState.holidays = data.holidays || [];
                saveState();
                renderDashboard();
                renderTimetableGrid();
                renderAttendanceTable();
                renderHolidaysList();
                showToast('Data imported successfully!', 'success');
            } catch (err) {
                showToast('Invalid file format', 'error');
            }
        };
        reader.readAsText(file);
    });

    // Reset
    document.getElementById('resetBtn').addEventListener('click', () => {
        if (confirm('Are you sure you want to reset all data? This cannot be undone.')) {
            appState = { timetable: {}, attendance: [], holidays: [] };
            saveState();
            renderDashboard();
            renderTimetableGrid();
            renderAttendanceTable();
            renderHolidaysList();
            // Hide cards
            document.getElementById('timetableGridCard').style.display = 'none';
            document.getElementById('timetablePreviewCard').style.display = 'none';
            document.getElementById('attendanceTableCard').style.display = 'none';
            document.getElementById('attendancePreviewCard').style.display = 'none';
            document.getElementById('predictionResults').style.display = 'none';
            showToast('All data has been reset', 'warning');
        }
    });
}
