/* --- CONFIGURATION HANDLER --- */
const API_CONFIG = {

    API_KEY: window.env?.API_KEY || (typeof CONFIG !== 'undefined' ? CONFIG.API_KEY : ''),
    CLIENT_ID: window.env?.CLIENT_ID || (typeof CONFIG !== 'undefined' ? CONFIG.CLIENT_ID : ''),
    
    SCOPES: 'https://www.googleapis.com/auth/drive.file',
    DISCOVERY_DOC: 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'
};

/* --- STATE MANAGEMENT --- */
let tokenClient;
let notes = JSON.parse(localStorage.getItem('vi_notes')) || [];
let currentEditingId = null;
let isLoginInProgress = false;

const board = document.getElementById('board');
const overlay = document.getElementById('editor-overlay');
const titleInp = document.getElementById('note-title');
const contentDiv = document.getElementById('note-content');

/* --- TOAST NOTIFICATION --- */
function showToast(message, type = "success") {
    const existingToast = document.getElementById('vi-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.id = 'vi-toast';
    toast.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg transition-all transform translate-x-0 opacity-100 ${
        type === 'error' ? 'bg-red-100 border border-red-300 text-red-700' : 
        type === 'warning' ? 'bg-amber-100 border border-amber-300 text-amber-700' :
        'bg-emerald-100 border border-emerald-300 text-emerald-700'
    }`;
    toast.innerHTML = `
        <div class="flex items-center">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                ${type === 'error' ? 
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>' :
                type === 'warning' ?
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>' :
                    '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>'
                }
            </svg>
            <span class="text-sm font-medium">${message}</span>
        </div>
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* --- INITIALIZE GOOGLE API --- */
function gapiLoaded() {
    gapi.load('client', async () => {
        try {
            await gapi.client.init({
                apiKey: API_CONFIG.API_KEY,
                discoveryDocs: [API_CONFIG.DISCOVERY_DOC],
            });
            checkExistingSession();
        } catch (error) {
            console.error("GAPI Init Error:", error);
        }
    });
}

/* --- UPDATE FUNGSI gisLoaded callback --- */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: API_CONFIG.CLIENT_ID,
        scope: API_CONFIG.SCOPES,
        callback: async (resp) => {
            if (resp.error) {
                console.error("OAuth Error:", resp.error);
                isLoginInProgress = false;
                if (resp.error === 'popup_closed_by_user') {
                    showToast("Login cancelled", "warning");
                }
                return;
            }
            
            console.log("Login successful!");
            
            // Simpan sesi
            const expiry = Date.now() + (resp.expires_in * 1000);
            localStorage.setItem('gdrive_session', JSON.stringify({
                access_token: resp.access_token,
                expires_at: expiry
            }));
            
            // Set token ke GAPI
            gapi.client.setToken({ access_token: resp.access_token });
            
            // Update UI button
            updateCloudButtonActive();
            
            // Tutup modal
            const askModal = document.getElementById('sync-ask-modal');
            if (askModal) {
                askModal.classList.replace('flex', 'hidden');
            }
            
            // **PERBAIKAN: Upload dulu, baru sync dari Drive**
            setTimeout(async () => {
                try {
                    // Ambil data terbaru dari localStorage
                    const latestNotes = localStorage.getItem('vi_notes');
                    if (latestNotes) {
                        notes = JSON.parse(latestNotes);
                    }
                    
                    console.log(`Uploading ${notes.length} notes after login...`);
                    
                    // 1. Upload SEMUA notes termasuk yang dibuat sebelum login
                    const uploadedCount = await uploadAllNotesToDrive();
                    
                    // 2. Sync dari drive untuk mendapatkan data terbaru
                    // (Ini akan menampilkan progress modal)
                    await syncFromDrive();
                    
                    if (uploadedCount > 0) {
                        showToast(`Synced ${uploadedCount} notes to Google Drive`);
                    }
                    
                } catch (error) {
                    console.error("Error during post-login sync:", error);
                    hideSyncProgressModal();
                    showToast("Sync completed with some errors", "warning");
                } finally {
                    isLoginInProgress = false;
                }
            }, 1000);
        }
    });
}

async function updateCloudButtonActive() {
    const btn = document.getElementById('export-gdrive');
    if (!btn) return;

    try {
        // Mengambil info akun dari Google Drive API
        const response = await gapi.client.drive.about.get({
            fields: 'user(emailAddress)'
        });
        const userEmail = response.result.user.emailAddress;

        // Update tampilan tombol dengan Email
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-emerald-600 font-medium truncate max-w-[120px]" title="${userEmail}">
                ${userEmail}
            </span>
        `;
        
        // Update styling ke warna Emerald (Hijau)
        btn.classList.remove('border-slate-200', 'bg-white'); // Bersihkan class default jika ada
        btn.classList.add('border-emerald-100', 'bg-emerald-50/50');
        
    } catch (err) {
        console.error("Failed to get email:", err);
        // Fallback jika gagal mengambil email
        btn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <span class="text-emerald-600">GDrive Active</span>
        `;
    }
}

function htmlToMd(html) {
    if (!html) return "";
    return html
        .replace(/<b>(.*?)<\/b>/g, '**$1**')
        .replace(/<strong>(.*?)<\/strong>/g, '**$1**')
        .replace(/<i>(.*?)<\/i>/g, '_$1_')
        .replace(/<em>(.*?)<\/em>/g, '_$1_')
        .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
        .replace(/<a [^>]*>(.*?)<\/a>/g, '$1') 
        .replace(/<div><br><\/div>/g, '\n')
        .replace(/<div>(.*?)<\/div>/g, '\n$1')
        .replace(/<br>/g, '\n')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function mdToHtml(md) {
    if (!md) return "";
    return md
        .replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>')
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
        .replace(/__(.*?)__/g, '<b>$1</b>')
        .replace(/\*(.*?)\*/g, '<i>$1</i>')
        .replace(/_(.*?)_/g, '<i>$1</i>')
        .replace(/~~(.*?)~~/g, '<strike>$1</strike>')
        .replace(/<u>(.*?)<\/u>/g, '<u>$1</u>')
        .replace(/(?<!["=])(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline cursor-pointer hover:text-blue-600">$1</a>')
        .replace(/\n/g, '<br>');
}

contentDiv.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        if (['b', 'i', 'u'].includes(key)) {
            e.preventDefault();
            if (key === 'b') document.execCommand('bold', false, null);
            if (key === 'i') document.execCommand('italic', false, null);
            if (key === 'u') document.execCommand('underline', false, null);
        }
    }
});

function checkExistingSession() {
    const sessionStr = localStorage.getItem('gdrive_session');
    if (sessionStr) {
        const session = JSON.parse(sessionStr);
        if (Date.now() < session.expires_at) {
            gapi.client.setToken({ access_token: session.access_token });
            updateCloudButtonActive();
            syncFromDrive();
        } else { 
            localStorage.removeItem('gdrive_session');
        }
    }
}

window.onload = () => { 
    const saved = localStorage.getItem('vi_notes');
    if (saved) notes = JSON.parse(saved);
    
    gapiLoaded(); 
    gisLoaded();
    renderBoard(); 
};

/* --- CLOUD FUNCTIONS --- */
async function getOrCreateVinotesFolder(token) {
    const query = encodeURIComponent("name='Vinotes' and mimeType='application/vnd.google-apps.folder' and trashed=false");
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
    });
    const data = await resp.json();
    if (data.files?.length > 0) return data.files[0].id;

    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Vinotes', mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await create.json();
    return folder.id;
}

async function deleteFromDrive(driveFileId) {
    if (!driveFileId) return;
    const token = gapi.client.getToken();
    if (!token) return;
    try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${driveFileId}`, {
            method: 'DELETE', 
            headers: { 'Authorization': `Bearer ${token.access_token}` }
        });
    } catch (e) { 
        console.error("Cloud Delete Error", e); 
    }
}

/* --- UPDATE FUNGSI syncFromDrive --- */
async function syncFromDrive() {
    const token = gapi.client.getToken();
    if (!token) return;
    
    try {
        const folderId = await getOrCreateVinotesFolder(token.access_token);
        const query = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        
        // Tampilkan progress bar minimal
        showSyncProgress(0);
        updateSyncProgress(0, 0, 'Connecting to Drive...');
        
        const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id, name, createdTime)`, {
            headers: { 'Authorization': `Bearer ${token.access_token}` }
        });
        const data = await resp.json();
        
        if (data.files && data.files.length > 0) {
            const totalFiles = data.files.length;
            showSyncProgress(totalFiles);
            
            let cloudNotes = [];
            let processedFiles = 0;
            
            updateSyncProgress(0, totalFiles, 'Preparing to download...');
            
            for (const file of data.files) {
                try {
                    // Update progress
                    updateSyncProgress(processedFiles + 1, totalFiles, file.name);
                    
                    const fileResp = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, { 
                        headers: { 'Authorization': `Bearer ${token.access_token}` } 
                    });
                    const fullText = await fileResp.text();
                    const lines = fullText.split('\n');
                    
                    // Parse metadata
                    const contentParts = fullText.split('---');
                    let noteId = new Date(file.createdTime).getTime();
                    let important = false;
                    
                    if (contentParts.length > 1) {
                        const metaLines = contentParts[1].split('\n');
                        for (const line of metaLines) {
                            if (line.includes('id:')) {
                                const idMatch = line.match(/id:\s*(\d+)/);
                                if (idMatch) {
                                    noteId = parseInt(idMatch[1]);
                                }
                            }
                            if (line.includes('important:')) {
                                important = line.includes('true');
                            }
                        }
                    }
                    
                    cloudNotes.push({
                        id: noteId,
                        title: lines[0].trim() || file.name.replace('.md', ''),
                        content: lines.slice(1).join('\n').split('---')[0].trim(),
                        driveFileId: file.id,
                        important: important
                    });
                    
                    processedFiles++;
                    updateSyncProgress(processedFiles, totalFiles, file.name);
                    
                    // Small delay
                    if (processedFiles < totalFiles) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                    }
                    
                } catch (error) {
                    console.error(`Error processing file ${file.name}:`, error);
                    processedFiles++;
                    updateSyncProgress(processedFiles, totalFiles, `Error: ${file.name.substring(0, 20)}`);
                }
            }
            
            if (cloudNotes.length > 0) {
                // Gabungkan dengan notes lokal
                updateSyncProgress(totalFiles, totalFiles, 'Merging notes...');
                
                const localNotes = JSON.parse(localStorage.getItem('vi_notes') || '[]');
                const cloudMap = new Map(cloudNotes.map(note => [note.id, note]));
                
                localNotes.forEach(localNote => {
                    if (cloudMap.has(localNote.id)) {
                        const cloudNote = cloudMap.get(localNote.id);
                        if (!cloudNote.important && localNote.important) {
                            cloudNote.important = localNote.important;
                        }
                    } else {
                        cloudNotes.push(localNote);
                    }
                });
                
                notes = cloudNotes;
                localStorage.setItem('vi_notes', JSON.stringify(notes));
                
                updateSyncProgress(totalFiles, totalFiles, 'Complete!');
                
                // Render setelah progress selesai
                setTimeout(() => {
                    renderBoard();
                    showToast(`Synced ${cloudNotes.length} notes`);
                }, 500);
                
            } else {
                hideSyncProgress();
                showToast("No notes found in Drive");
            }
            
        } else {
            hideSyncProgress();
            showToast("No notes found in Drive");
        }
        
    } catch (err) { 
        console.error("Sync error", err);
        hideSyncProgress();
        showToast("Sync failed: " + (err.message || "Unknown error"), "error");
    }
}

/* --- UPDATE FUNGSI uploadAllNotesToDrive DENGAN PROGRESS --- */
async function uploadAllNotesToDrive() {
    const btn = document.getElementById('export-gdrive');
    
    // Pastikan token tersedia
    let token = gapi.client.getToken();
    if (!token) {
        console.error("No token available for upload");
        return 0;
    }

    // Ambil data terbaru
    const savedData = localStorage.getItem('vi_notes');
    if (savedData) notes = JSON.parse(savedData);

    if (notes.length === 0) {
        console.log("No notes to upload");
        return 0;
    }

    // Filter notes yang belum punya driveFileId
    const notesToUpload = notes.filter(note => !note.driveFileId);
    
    if (notesToUpload.length === 0) {
        console.log("All notes already uploaded");
        return 0;
    }

    console.log(`Starting upload of ${notesToUpload.length} notes to Drive`);
    
    try {
        const folderId = await getOrCreateVinotesFolder(token.access_token);
        let uploadedCount = 0;
        let errors = [];
        
        for (let i = 0; i < notesToUpload.length; i++) {
            const note = notesToUpload[i];
            const fileName = `${(note.title || 'Untitled').replace(/[^a-z0-9]/gi, '_')}_${note.id}.md`;
            const fileBody = `${(note.title || 'Untitled').toUpperCase()}\n\n${note.content}\n\n---\nid: ${note.id}\nimportant: ${note.important || false}`;
            const fileBlob = new Blob([fileBody], { type: 'text/markdown' });

            console.log(`Uploading note ${i+1}/${notesToUpload.length}: ${fileName}`);
            
            try {
                const metadata = { 
                    'name': fileName, 
                    'mimeType': 'text/markdown', 
                    'parents': [folderId],
                    'properties': {
                        'vi_note_id': note.id.toString(),
                        'important': (note.important || false).toString()
                    }
                };
                
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', fileBlob);
                
                const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST', 
                    headers: { 'Authorization': 'Bearer ' + token.access_token }, 
                    body: form
                });
                
                if (!response.ok) {
                    throw new Error(`Upload failed: ${response.status}`);
                }
                
                const fileData = await response.json(); 
                
                // Update note dengan driveFileId
                const noteIndex = notes.findIndex(n => n.id === note.id);
                if (noteIndex !== -1) {
                    notes[noteIndex].driveFileId = fileData.id;
                }
                
                uploadedCount++;
                
                console.log(`Uploaded note ${note.id} with drive ID: ${fileData.id}`);
                
                // Simpan progress setiap 3 notes
                if (uploadedCount % 3 === 0) {
                    localStorage.setItem('vi_notes', JSON.stringify(notes));
                }
                
            } catch (error) {
                console.error(`Error uploading note ${note.id}:`, error);
                errors.push({ noteId: note.id, error: error.message });
            }
        }
        
        // Final save
        localStorage.setItem('vi_notes', JSON.stringify(notes));
        renderBoard();
        
        console.log(`Upload completed: ${uploadedCount} notes uploaded, ${errors.length} errors`);
        
        return uploadedCount;
        
    } catch (error) {
        console.error("Upload All Notes Error:", error);
        throw error;
    }
}

async function getDriveEmail() {
    try {
        const response = await gapi.client.drive.about.get({
            fields: 'user(emailAddress)'
        });
        return response.result.user.emailAddress;
    } catch (err) {
        console.error("Error fetching email:", err);
        return "GDrive Active"; // Fallback jika gagal
    }
}

/* --- FUNGSI UPLOAD REGULAR --- */
async function uploadToDrive() {
    const btn = document.getElementById('export-gdrive');
    const originalBtnHTML = btn ? btn.innerHTML : null;
    
    try {
        // Cek token
        let token = gapi.client.getToken();
        if (!token) {
            const sessionStr = localStorage.getItem('gdrive_session');
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                if (Date.now() < session.expires_at) {
                    gapi.client.setToken({ access_token: session.access_token });
                    token = gapi.client.getToken();
                } else {
                    localStorage.removeItem('gdrive_session');
                }
            }
        }
        
        if (!token) { 
            // Jika tidak ada token, trigger login via modal
            console.log("No token, showing login modal...");
            const askModal = document.getElementById('sync-ask-modal');
            if (askModal) {
                askModal.classList.remove('hidden');
                askModal.classList.add('flex');
            }
            return; 
        }

        // Update button state
        if (btn) {
            btn.innerHTML = `
                <svg class="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-slate-500">Syncing...</span>
            `;
            btn.disabled = true;
        }

        // Ambil data terbaru
        const savedData = localStorage.getItem('vi_notes');
        if (savedData) notes = JSON.parse(savedData);

        if (notes.length === 0) {
            console.log("No notes to upload");
            if (btn) {
                btn.innerHTML = originalBtnHTML;
                btn.disabled = false;
            }
            return;
        }

        // Upload ke Drive
        const folderId = await getOrCreateVinotesFolder(token.access_token);
        let uploadedCount = 0;
        
        for (let i = 0; i < notes.length; i++) {
            let note = notes[i];
            const fileName = `${(note.title || 'Untitled').replace(/[^a-z0-9]/gi, '_')}_${note.id}.md`;
            const fileBody = `${(note.title || 'Untitled').toUpperCase()}\n\n${note.content}\n\n---\nid: ${note.id}\nimportant: ${note.important || false}`;
            const fileBlob = new Blob([fileBody], { type: 'text/markdown' });

            let targetFileId = note.driveFileId;

            if (targetFileId) {
                // Update existing
                await fetch(`https://www.googleapis.com/upload/drive/v3/files/${targetFileId}?uploadType=media`, {
                    method: 'PATCH', 
                    headers: { 'Authorization': 'Bearer ' + token.access_token }, 
                    body: fileBlob
                });
            } else {
                // Create new
                const metadata = { 
                    'name': fileName, 
                    'mimeType': 'text/markdown', 
                    'parents': [folderId],
                    'properties': {
                        'vi_note_id': note.id.toString(),
                        'important': (note.important || false).toString()
                    }
                };
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', fileBlob);
                
                const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                    method: 'POST', 
                    headers: { 'Authorization': 'Bearer ' + token.access_token }, 
                    body: form
                });
                const f = await r.json(); 
                notes[i].driveFileId = f.id;
            }
            uploadedCount++;
        }

        // Simpan ke localStorage
        localStorage.setItem('vi_notes', JSON.stringify(notes));
        renderBoard();

        // Update UI Status GDrive
        if (btn) {
            // Kita jalankan secara async agar tidak menghambat rendering board
            (async () => {
                const userEmail = await getDriveEmail();
                
                btn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                    </svg>
                    <span class="text-emerald-600 font-medium truncate max-w-[150px]">${userEmail}</span>
                `;
                btn.classList.remove('bg-indigo-50/50', 'border-indigo-100'); // Bersihkan class lama jika ada
                btn.classList.add('bg-emerald-50/50', 'border-emerald-100');
                btn.disabled = false;
            })();
        }

    } catch (err) { 
        console.error("Upload Error:", err);
        if (btn) {
            btn.innerHTML = `<span class="text-red-500">Sync Error</span>`;
            btn.disabled = false;
        }
    }
}


function renderBoard() {
    if (!board) return;
    board.innerHTML = '';
    
    // 1. Render tombol "New Note" di POSISI PERTAMA (kiri)
    renderAddCard();
    
    // 2. Sort notes: important first, then by creation time
    const sortedNotes = [...notes].sort((a, b) => {
        if (a.important && !b.important) return -1;
        if (!a.important && b.important) return 1;
        return b.id - a.id; // Newer first
    });
    
    // 3. Render notes setelah tombol "New Note"
    sortedNotes.forEach(note => {
        const file = document.createElement('div');
        const topBarColor = note.important ? 'bg-red-500' : 'group-hover:bg-indigo-500';
        const shadowColor = note.important ? 'shadow-red-100 border-red-100' : 'shadow-slate-100';

        file.className = `w-full aspect-[3/4] md:w-52 md:h-64 paper-stack cursor-pointer flex flex-col p-6 overflow-hidden relative group ${shadowColor}`;
        file.onclick = () => openEditor(note.id);
        
        file.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-1.5 ${topBarColor} transition-colors"></div>
            
            ${note.important ? '<span class="text-[8px] font-black text-red-500 mb-2 tracking-[0.2em]">PINNED</span>' : ''}
            
            <h3 class="font-bold text-sm line-clamp-2 mb-3 uppercase tracking-tight text-slate-800">${note.title || 'Untitled'}</h3>
            
            <div class="text-[11px] text-slate-500 line-clamp-[7] leading-relaxed pointer-events-none">
                ${mdToHtml(note.content)}
            </div>

            <div class="absolute bottom-3 right-3 flex items-center gap-1">
                <div class="w-1.5 h-1.5 rounded-full ${note.driveFileId ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-rose-500 animate-pulse'}" 
                    title="${note.driveFileId ? 'Synced to Cloud' : 'Local Only'}">
                </div>
            </div>
        `;
        board.appendChild(file);
    });
}


function renderAddCard() {
    const addCard = document.createElement('div');
    addCard.className = "w-full aspect-[3/4] md:w-52 md:h-64 add-card-btn cursor-pointer transition-all flex flex-col items-center justify-center group border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl hover:border-indigo-300 dark:hover:border-indigo-900";
    
    // Sekarang memicu Modal, bukan langsung editor
    addCard.onclick = () => openCreateModal(); 
    
    addCard.innerHTML = `
        <div class="w-12 h-12 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
            <span class="text-3xl text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors">+</span>
        </div>
        <span class="text-[10px] font-black uppercase tracking-[0.2em] mt-4 text-slate-400 group-hover:text-indigo-500">New</span>
    `;
    board.appendChild(addCard);
}


function openEditor(id = null) {
    currentEditingId = id;
    if (id) {
        const note = notes.find(n => n.id === id);
        titleInp.value = note.title; 
        contentDiv.innerHTML = mdToHtml(note.content);
        document.getElementById('note-important').checked = note.important || false;
    } else { 
        titleInp.value = ''; 
        contentDiv.innerHTML = ''; 
        document.getElementById('note-important').checked = false; 
    }
    overlay.classList.add('active-modal');

    setTimeout(() => {
        titleInp.focus();
    }, 50); 
}

function saveNote() {
    const title = titleInp.value.trim();
    const contentMd = htmlToMd(contentDiv.innerHTML);
    const isImportant = document.getElementById('note-important').checked;
    
    if (!title && !contentMd) return;

    const noteData = { 
        id: currentEditingId || Date.now(), 
        title, 
        content: contentMd, 
        important: isImportant,
        driveFileId: currentEditingId ? notes.find(n => n.id === currentEditingId)?.driveFileId : null
    };

    if (currentEditingId) {
        // Mode edit: hapus yang lama
        notes = notes.filter(n => n.id !== currentEditingId);
    }
    
    // **PERBAIKAN: TAMBAHKAN CATATAN BARU KE ARRAY, TAPI TIDAK MENGURUTKAN DI SINI**
    // Urutan akan ditangani di renderBoard()
    notes.push(noteData);
    
    // SIMPAN KE LOCALSTORAGE DULU
    localStorage.setItem('vi_notes', JSON.stringify(notes));
    
    // **PERBAIKAN: Tutup editor SEBELUM render**
    overlay.classList.remove('active-modal');
    
    // Render ulang board
    renderBoard();

    // Cek login status
    const token = gapi.client.getToken();
    const sessionExists = localStorage.getItem('gdrive_session');

    if (token || sessionExists) {
        // Sudah login, upload
        uploadToDrive();
    } else {
        // Belum login, tampilkan modal
        const askModal = document.getElementById('sync-ask-modal');
        if (askModal) {
            askModal.classList.remove('hidden');
            askModal.classList.add('flex');
        }
    }
}

function closeEditor(e) {
    if (!e || e.target === overlay) {
        saveNote();
        // Hapus baris ini karena saveNote() sudah menutup overlay
        // overlay.classList.remove('active-modal');
    }
}

// Handler untuk tombol di modal sync
function handleCloudChoice() {
    console.log("User chose to connect Google Drive");
    
    // Tutup modal
    const askModal = document.getElementById('sync-ask-modal');
    if (askModal) {
        askModal.classList.replace('flex', 'hidden');
    }
    
    // Simpan notes ke localStorage sebelum login
    localStorage.setItem('vi_notes', JSON.stringify(notes));
    
    // Trigger login
    if (!isLoginInProgress) {
        isLoginInProgress = true;
        tokenClient.requestAccessToken({ prompt: 'consent' });
    }
}

function handleGuestChoice() {
    document.getElementById('sync-ask-modal').classList.replace('flex', 'hidden');
    showToast("Continuing offline. Notes saved locally.");
}

/* --- DELETE FUNCTIONS --- */
function deleteCurrentNote() {
    if (!currentEditingId) {
        overlay.classList.remove('active-modal');
        return;
    }
    const confirmModal = document.getElementById('delete-confirm-modal');
    if (confirmModal) {
        confirmModal.classList.remove('hidden');
        confirmModal.classList.add('flex');
    }
}

function closeDeleteModal() {
    const confirmModal = document.getElementById('delete-confirm-modal');
    if (confirmModal) {
        confirmModal.classList.replace('flex', 'hidden');
    }
}

async function executeDelete() {
    if (currentEditingId) {
        const noteToDelete = notes.find(n => n.id === currentEditingId);
        
        notes = notes.filter(n => n.id !== currentEditingId);
        localStorage.setItem('vi_notes', JSON.stringify(notes));
        renderBoard();
        
        closeDeleteModal();
        overlay.classList.remove('active-modal');

        if (noteToDelete && noteToDelete.driveFileId) {
            await deleteFromDrive(noteToDelete.driveFileId);
        }
    }
}

/* --- SESSION FUNCTIONS --- */
function destroy_session() {
    const destroyModal = document.getElementById('destroy-confirm-modal');
    if (destroyModal) {
        destroyModal.classList.remove('hidden');
        destroyModal.classList.add('flex');
    }
}

function closeDestroyModal() {
    const destroyModal = document.getElementById('destroy-confirm-modal');
    if (destroyModal) {
        destroyModal.classList.replace('flex', 'hidden');
    }
}

function save_and_cancel_destroy() {
    closeDestroyModal();
    uploadToDrive();
}

function session_destroy() {
    localStorage.removeItem('gdrive_session');
    localStorage.clear();
    notes = [];
    location.reload();
}

function execute_destroy() {
    session_destroy();
}

/* --- EVENT LISTENERS --- */
// Tombol Sync utama
document.getElementById('export-gdrive').onclick = function() {
    const token = gapi.client.getToken();
    const sessionExists = localStorage.getItem('gdrive_session');
    
    if (token || sessionExists) {
        // Sudah login, langsung sync
        uploadToDrive();
    } else {
        // Belum login, tampilkan modal
        const askModal = document.getElementById('sync-ask-modal');
        if (askModal) {
            askModal.classList.remove('hidden');
            askModal.classList.add('flex');
        }
    }
};

// Link handling
contentDiv.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
        window.open(e.target.href, '_blank');
    }
});


/* --- MINIMAL SYNC PROGRESS BAR --- */
let totalFilesToSync = 0;
let currentSyncProgress = 0;
let syncInterval = null;

function showSyncProgress(totalFiles) {
    totalFilesToSync = totalFiles;
    currentSyncProgress = 0;
    
    // Hapus progress bar jika sudah ada
    const existingProgress = document.getElementById('sync-progress-container');
    if (existingProgress) existingProgress.remove();
    
    // Buat progress bar minimal di pojok kiri bawah
    const progressContainer = document.createElement('div');
    progressContainer.id = 'sync-progress-container';
    progressContainer.className = 'fixed bottom-4 left-4 z-[999] w-80';
    progressContainer.innerHTML = `
        <div class="bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl shadow-xl p-4 animate-fadeInUp">
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                    <svg class="animate-spin h-4 w-4 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span class="text-xs font-semibold text-slate-700">Syncing from Drive</span>
                </div>
                <span id="sync-progress-text" class="text-xs font-medium text-slate-500">0/${totalFiles}</span>
            </div>
            
            <!-- Progress Bar -->
            <div class="mb-2">
                <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div id="sync-progress-bar" class="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
            </div>
            
            <!-- Status Message -->
            <div class="flex justify-between items-center">
                <span id="sync-current-file" class="text-[10px] text-slate-500 truncate max-w-[180px]">Starting sync...</span>
                <span class="text-[10px] text-slate-400 italic">You can continue working</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(progressContainer);
    
    // Auto hide setelah 5 detik jika stuck
    syncInterval = setTimeout(() => {
        const progressText = document.getElementById('sync-progress-text');
        if (progressText && progressText.textContent === '0/0') {
            hideSyncProgress();
        }
    }, 5000);
}


function updateSyncProgress(current, total, fileName = '') {
    currentSyncProgress = current;
    
    const progressBar = document.getElementById('sync-progress-bar');
    const progressText = document.getElementById('sync-progress-text');
    const currentFile = document.getElementById('sync-current-file');
    
    if (progressBar) {
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        progressBar.style.width = `${percentage}%`;
    }
    
    if (progressText) {
        progressText.textContent = `${current}/${total}`;
    }
    
    if (currentFile) {
        if (fileName) {
            const shortName = fileName.length > 25 ? fileName.substring(0, 22) + '...' : fileName;
            currentFile.textContent = shortName;
        } else if (total > 0) {
            currentFile.textContent = `Processing ${current} of ${total}`;
        }
    }
    
    // Auto hide jika sudah selesai
    if (current >= total && total > 0) {
        setTimeout(() => {
            hideSyncProgress();
        }, 1500); // Tunggu 1.5 detik sebelum hide
    }
}

function hideSyncProgress() {
    if (syncInterval) {
        clearTimeout(syncInterval);
        syncInterval = null;
    }
    
    const progressContainer = document.getElementById('sync-progress-container');
    if (progressContainer) {
        // Animasi fade out
        progressContainer.style.opacity = '0';
        progressContainer.style.transform = 'translateY(10px)';
        setTimeout(() => {
            progressContainer.remove();
        }, 300);
    }
}

// Di bagian paling bawah app.js
if (contentDiv) {
    contentDiv.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const text = contentDiv.innerText;
            // Cek apakah ada command sebelum kursor/di baris tersebut
            if (text.includes(':')) {
                // Kita cegah baris baru bawaan Enter muncul duluan
                // agar pembersihan teks di command.js lebih rapi
                checkCommands(text, currentEditingId);
            }
        }
    });
}


async function checkShareLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const viewId = urlParams.get('view');

    if (!viewId || sessionStorage.getItem(`importing_${viewId}`)) return;

    if (typeof notes === 'undefined') {
        setTimeout(checkShareLink, 100);
        return;
    }

    // Pindahkan flag ke awal untuk mencegah request ganda saat proses fetch
    sessionStorage.setItem(`importing_${viewId}`, 'true');

    try {
        const apiKey = CONFIG.API_KEY; 
        
        // 1. TAMBAHKAN CACHE BUSTER (?v=timestamp) agar selalu ambil data terbaru dari Drive Akun A
        const cacheBuster = `&v=${Date.now()}`;
        const [metaResp, contentResp] = await Promise.all([
            fetch(`https://www.googleapis.com/drive/v3/files/${viewId}?fields=owners(emailAddress)&key=${apiKey}`),
            fetch(`https://www.googleapis.com/drive/v3/files/${viewId}?alt=media&key=${apiKey}${cacheBuster}`)
        ]);

        if (!contentResp.ok) throw new Error("Note not found or access denied");

        const metaData = await metaResp.json();
        const rawContent = await contentResp.text();
        const ownerEmail = (metaData.owners && metaData.owners.length > 0) ? metaData.owners[0].emailAddress : "Anonymous";

        // Cleaning Logic
        let mainContent = rawContent.split('---')[0].trim();
        let lines = mainContent.split('\n');
        let cleanTitle = "Shared Note";
        for (let line of lines) {
            if (line.trim() !== "") {
                cleanTitle = line.trim();
                break;
            }
        }

        // 2. LOGIKA UPDATE: Cek apakah catatan ini sudah pernah diimpor sebelumnya
        // Kita gunakan properti 'originalShareId' untuk melacak sumbernya
        const existingNoteIndex = notes.findIndex(n => n.originalShareId === viewId);
        let targetId;

        if (existingNoteIndex !== -1) {
            // UPDATE: Jika sudah ada, perbarui isinya
            notes[existingNoteIndex].title = cleanTitle;
            notes[existingNoteIndex].content = `
<div contenteditable="false" class="pb-2 border-b border-slate-200 dark:border-slate-700 select-none mb-4">
    <p class="font-medium text-[10px] text-blue-500 uppercase tracking-widest">Updated Version</p>
    <p class="font-medium text-sm">From: <span class="text-blue-600">${ownerEmail}</span></p>
</div>
${mainContent}`;
            notes[existingNoteIndex].lastModified = new Date().toISOString();
            targetId = notes[existingNoteIndex].id;
            showToast("Note updated to latest version", "info");
        } else {
            // INSERT: Jika belum ada, buat baru
            targetId = Date.now();
            const newSharedNote = {
                id: targetId,
                originalShareId: viewId, // Penanda agar bisa di-update nanti
                title: cleanTitle,
                content: `
<div contenteditable="false" class="pb-2 border-b border-slate-200 dark:border-slate-700 select-none mb-4">
    <p class="font-medium text-sm">From: <span class="text-blue-600">${ownerEmail}</span></p>
</div>
${mainContent}`,
                lastModified: new Date().toISOString(),
                important: false
            };
            notes.unshift(newSharedNote);
            showToast(`Note from ${ownerEmail} saved!`);
        }

        // Simpan ke storage lokal
        localStorage.setItem('vi_notes', JSON.stringify(notes));

        // Redirect URL segera agar bersih
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        // 3. TRIGGER SYNC: Upload ke Drive Akun B
        if (typeof gapi !== 'undefined' && gapi.client.getToken()) {
            if (typeof syncNotes === 'function') await syncNotes(); 
        }

        // Refresh UI
        if (typeof renderBoard === 'function') renderBoard();
        if (typeof renderNotes === 'function') renderNotes();
        
        if (typeof openEditor === 'function') {
            setTimeout(() => openEditor(targetId), 500);
        }

    } catch (err) {
        console.error("Import Error:", err);
        showToast("Problem accessing shared note", "error");
    } finally {
        sessionStorage.removeItem(`importing_${viewId}`);
    }
}

window.addEventListener('load', checkShareLink);



// 

function openCreateModal() {
    // Hapus modal lama jika masih ada (mencegah tumpukan ID ganda)
    const oldModal = document.getElementById('create-modal');
    if (oldModal) oldModal.remove();

    const modal = document.createElement('div');
    modal.id = 'create-modal';
    modal.className = "fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200";
    
    // Gunakan template literal tapi pastikan fungsi dipanggil dengan benar
    modal.innerHTML = `
        <div id="modal-content" class="bg-white dark:bg-slate-900 w-full max-w-md rounded-[32px] p-6 md:p-8 shadow-2xl border border-slate-100 dark:border-slate-800 transform animate-in zoom-in-95 duration-200">
            <h3 class="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400 mb-8 text-center leading-none">Create New</h3>
            
            <div class="grid grid-cols-2 gap-4 mb-6">
                <button id="btn-new-note" class="flex flex-col items-center justify-center p-6 rounded-3xl bg-indigo-50/50 dark:bg-indigo-500/5 border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-100 dark:hover:bg-indigo-500/10 transition-all group">
                    <div class="w-12 h-12 rounded-2xl bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 mb-3 group-hover:scale-110 transition-transform pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </div>
                    <span class="text-sm font-bold text-slate-700 dark:text-slate-200 pointer-events-none">Note</span>
                </button>

                <button id="btn-new-folder" class="flex flex-col items-center justify-center p-6 rounded-3xl bg-emerald-50/50 dark:bg-emerald-500/5 border border-emerald-100 dark:border-emerald-500/20 hover:bg-emerald-100 dark:hover:bg-emerald-500/10 transition-all group">
                    <div class="w-12 h-12 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20 mb-3 group-hover:scale-110 transition-transform pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </div>
                    <span class="text-sm font-bold text-slate-700 dark:text-slate-200 pointer-events-none">Folder</span>
                </button>
            </div>

            <div class="relative group mt-2">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                </div>
                <input type="text" id="import-url-input" placeholder="Paste share link here..." 
                    class="w-full pl-11 pr-24 py-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all dark:text-slate-200">
                <button id="btn-import-submit" 
                    class="absolute right-2 top-2 bottom-2 px-4 bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-blue-500/20 active:scale-95">
                    Import
                </button>
            </div>

            <button id="btn-close-modal" class="mt-8 w-full py-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-all">Dismiss</button>
        </div>
    `;
    
    document.body.appendChild(modal);

    // --- EVENT LISTENERS (Cara yang lebih aman daripada inline onclick) ---
    
    // 1. Klik di luar modal untuk menutup
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeCreateModal();
    });

    // 2. Tombol Note
    document.getElementById('btn-new-note').addEventListener('click', () => {
        closeCreateModal();
        if (typeof openEditor === 'function') openEditor();
    });

    // 3. Tombol Folder
    document.getElementById('btn-new-folder').addEventListener('click', () => {
        closeCreateModal();
        if (typeof createFolderPrompt === 'function') createFolderPrompt();
    });

    // 4. Tombol Dismiss
    document.getElementById('btn-close-modal').addEventListener('click', closeCreateModal);

    // 5. Input Import (Enter Key)
    const importInput = document.getElementById('import-url-input');
    importInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleImportAction();
    });

    // 6. Tombol Import Submit
    document.getElementById('btn-import-submit').addEventListener('click', handleImportAction);

    // Auto-focus
    setTimeout(() => importInput.focus(), 200);
}

function closeCreateModal() {
    const modal = document.getElementById('create-modal');
    if (modal) {
        modal.classList.add('fade-out'); // Jika ada animasi
        modal.remove();
    }
}

function handleImportAction() {
    const input = document.getElementById('import-url-input');
    if (!input) return;

    const link = input.value.trim();
    if (!link) {
        showToast("Paste a link first", "warning");
        return;
    }

    try {
        const url = new URL(link);
        const viewId = url.searchParams.get('view');

        if (viewId) {
            closeCreateModal();
            window.history.replaceState({}, document.title, window.location.origin + window.location.pathname + "?view=" + viewId);
            if (typeof checkShareLink === 'function') checkShareLink();
        } else {
            showToast("Invalid link! Ensure it has '?view='", "error");
        }
    } catch (e) {
        showToast("Please enter a valid URL", "error");
    }
}