# 📓 ViNotes // Digital Corkboard & Cloud Notes

![Version](https://img.shields.io/badge/version-2.0.0-indigo)
![License](https://img.shields.io/badge/license-MIT-green)
![Storage](https://img.shields.io/badge/storage-Google_Drive-blue)

**ViNotes** is a minimalist, high-performance digital corkboard designed for modern note-taking. It combines the tactile feel of a physical board with the power of Google Drive cloud synchronization.

---

## ✨ Key Features

* **Modern Minimalist UI**: Built with Tailwind CSS, featuring a clean Slate & Indigo aesthetic with a subtle dot-grid background.
* **WYSIWYG Markdown Editor**: Real-time formatting for Bold, Italic, Underline, and auto-detecting clickable links.
* **Google Drive Integration**: Sync your notes across devices using your own Google Drive storage. No middleman, just your data.
* **Important / Pinned Notes**: Mark critical notes to keep them at the top of your board with a distinct red visual indicator.
* **Session Management**: "Destroy Session" feature for privacy, allowing you to wipe local data instantly while keeping your cloud backups safe.
* **Guest Mode**: Fully functional offline/local-only mode for those who prefer not to use cloud sync.

---

## 🚀 Getting Started

### Prerequisites
To enable Google Drive sync, you will need:
1.  A **Google Cloud Console** Project.
2.  **OAuth 2.0 Client ID** and **API Key**.
3.  Enabled **Google Drive API** in your console.

### Installation
1.  Clone the repository:
    ```bash
    git clone [https://github.com/yourusername/vinotes.git](https://github.com/yourusername/vinotes.git)
    ```
2.  Open `index.html` in your browser.
3.  Enter your Google API Credentials in the configuration section of `app.js`.

---

## 🛠️ Tech Stack

* **Frontend**: HTML5, Tailwind CSS
* **Fonts**: Plus Jakarta Sans
* **Icons**: Heroicons / Inline SVGs
* **Backend/Cloud**: Google Drive API (GAPI)
* **Database**: LocalStorage (Local) & Markdown files (Cloud)

---

## 📂 Project Structure

```text
vinotes/
├── index.html    # Main UI Structure
├── app.js        # Core Logic (CRUD, GAPI, UI States)
└── README.md     # Project Documentation