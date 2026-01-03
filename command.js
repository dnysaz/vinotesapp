/* --- COMMAND HANDLER FOR VINOTES --- */
const COMMANDS = {
    ':file': async (noteId) => {
        console.log("Command Detected: :file for note", noteId);
        const input = document.createElement('input');
        input.type = 'file';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            showToast(`Uploading ${file.name}...`, "warning");
            
            try {
                const token = gapi.client.getToken();
                if (!token) throw new Error("Connect Google Drive first!");

                const folderId = await getOrCreateFolder("ViNotes_Files", token.access_token);
                
                // 1. UPLOAD FILE
                const metadata = { name: file.name, parents: [folderId] };
                const form = new FormData();
                form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                form.append('file', file);

                const resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token.access_token}` },
                    body: form
                });

                const data = await resp.json();
                const fileId = data.id;

                // 2. BERIKAN AKSES PUBLIK (Pelihat/Reader)
                // Ini akan membuat siapapun yang punya link bisa melihat file tanpa request access
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${token.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        'role': 'reader',
                        'type': 'anyone'
                    })
                });

                // 3. Masukkan link ke editor
                const linkMarkdown = ` [File: ${file.name}](${data.webViewLink}) `;
                document.execCommand('insertText', false, linkMarkdown);
                
                showToast("File uploaded & access granted!");
                
            } catch (err) {
                console.error("Upload Error:", err);
                showToast(err.message, "error");
            }
        };
        input.click();
    },

    ':share': async (noteId) => {
        console.log("Command Detected: :share");
        const currentNote = notes.find(n => n.id === noteId);
        if (!currentNote || !currentNote.driveFileId) {
            showToast("Sync this note to Drive first", "warning");
            return;
        }

        try {
            const token = gapi.client.getToken();
            // 1. Set izin file jadi public reader di Drive
            await fetch(`https://www.googleapis.com/drive/v3/files/${currentNote.driveFileId}/permissions`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'reader', type: 'anyone' })
            });

            // 2. Buat Link aplikasi ViNotes sendiri dengan ID file tersebut
            // Format: https://domain-anda.com/?view=ID_FILE_DRIVE
            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}?view=${currentNote.driveFileId}`;
            
            navigator.clipboard.writeText(shareUrl);
            showToast("ViNotes Link copied to clipboard!");
        } catch (err) {
            showToast("Failed to share", "error");
        }
    },

    ':qr': async (noteId) => {
        const currentNote = notes.find(n => n.id === noteId);
        if (!currentNote || !currentNote.driveFileId) {
            showToast("Sync note to Drive first", "warning");
            return;
        }

        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}?view=${currentNote.driveFileId}`;
        
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(shareUrl)}`;
        
        const qrModal = document.createElement('div');
        qrModal.className = "fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[200] flex items-center justify-center p-6";
        qrModal.onclick = () => qrModal.remove();
        qrModal.innerHTML = `
            <div class="bg-white p-10 rounded-[40px] text-center animate-modal shadow-2xl">
                <h3 class="text-xl font-bold mb-6 text-slate-800 tracking-tight">Scan Note via ViNotes</h3>
                <img src="${qrUrl}" class="mx-auto rounded-3xl shadow-lg mb-6 border-8 border-slate-50" />
                <p class="text-[10px] text-slate-400 uppercase tracking-[0.2em] font-bold">Open this note in any browser</p>
            </div>
        `;
        document.body.appendChild(qrModal);
    },
};

/* --- HELPER --- */
async function getOrCreateFolder(folderName, token) {
    const query = encodeURIComponent(`name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const resp = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}`, { 
        headers: { 'Authorization': `Bearer ${token}` } 
    });
    const data = await resp.json();
    if (data.files && data.files.length > 0) return data.files[0].id;

    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST', 
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder' })
    });
    const folder = await create.json();
    return folder.id;
}

/* --- CHECKER FUNCTION --- */
function checkCommands(content, noteId) {
    // 2. PASTIKAN DAFTAR INI SAMA DENGAN KEY DI ATAS
    const availableCommands = [':file', ':share', ':qr'];
    
    for (let cmd of availableCommands) {
        if (content.includes(cmd)) {
            // Jika ada event global, kita cegah default action-nya
            if (window.event) window.event.preventDefault(); 

            // Hapus command dari editor
            for (let i = 0; i < cmd.length; i++) {
                document.execCommand('delete', false, null);
            }

            console.log("Executing:", cmd);

            if (COMMANDS[cmd]) {
                COMMANDS[cmd](noteId);
            }
            break;
        }
    }
}