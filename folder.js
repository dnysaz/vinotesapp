/**
 * folder.js - Handling Virtual & Drive Folders
 */

// Inisialisasi data folder dari localStorage
let folders = JSON.parse(localStorage.getItem('vi_folders')) || [];

/**
 * Membuat folder baru (Local + GDrive)
 */
async function createFolderPrompt() {
    const name = prompt("Enter folder name:");
    if (!name || name.trim() === "") return;

    showToast("Creating folder...", "warning");

    let driveId = null;

    // Jika user terhubung ke Google Drive
    if (typeof gapi !== 'undefined' && gapi.client.getToken()) {
        try {
            // 1. Dapatkan/Buat Folder Utama "ViNotes"
            const rootId = await getOrCreateViNotesRoot();
            
            // 2. Buat sub-folder di dalam "ViNotes"
            const response = await gapi.client.drive.files.create({
                resource: {
                    name: name.trim(),
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [rootId]
                },
                fields: 'id'
            });
            driveId = response.result.id;
        } catch (err) {
            console.error("GDrive Error:", err);
            showToast("Cloud sync failed, folder created locally", "error");
        }
    }

    const newFolder = {
        id: 'fld_' + Date.now(),
        driveFolderId: driveId, // ID folder di Google Drive
        name: name.trim(),
        createdAt: new Date().toISOString()
    };

    folders.push(newFolder);
    saveFolders();
    renderBoard();
    showToast(`Folder "${name}" created successfully`);
}

/**
 * Mendapatkan ID Folder root "ViNotes" di Google Drive
 */
async function getOrCreateViNotesRoot() {
    const query = "name = 'ViNotes' and mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    const res = await gapi.client.drive.files.list({ q: query, fields: 'files(id)' });

    if (res.result.files && res.result.files.length > 0) {
        return res.result.files[0].id;
    } else {
        // Buat folder ViNotes jika belum ada
        const createRes = await gapi.client.drive.files.create({
            resource: {
                name: 'ViNotes',
                mimeType: 'application/vnd.google-apps.folder'
            },
            fields: 'id'
        });
        return createRes.result.id;
    }
}

/**
 * Menyimpan data folder ke LocalStorage
 */
function saveFolders() {
    localStorage.setItem('vi_folders', JSON.stringify(folders));
}

/**
 * Menghapus folder
 */
function deleteFolder(folderId) {
    if (!confirm("Delete this folder? Notes inside will be moved to Root.")) return;
    
    // Hapus dari array
    folders = folders.filter(f => f.id !== folderId);
    
    // Update notes: yang tadinya di folder ini, balikkan ke root (null)
    if (typeof notes !== 'undefined') {
        notes = notes.map(n => {
            if (n.folderId === folderId) return { ...n, folderId: null };
            return n;
        });
        localStorage.setItem('vi_notes', JSON.stringify(notes));
    }

    saveFolders();
    renderBoard();
    showToast("Folder deleted");
}