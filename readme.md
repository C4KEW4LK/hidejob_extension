# LinkedIn Job Manager

A simple Chrome extension that automatically manages job postings on LinkedIn by hiding dismissed job cards and auto-dismissing jobs with unwanted keywords.

**This is something I put together for myself, rather quickly, but thought others might find it useful. **

## Features

### **Dual Job Management**
- **Hide Dismissed Jobs**: Automatically hides job cards that you've already dismissed
- **Auto-Dismiss Keywords**: Automatically dismisses job postings containing specified keywords

### **Smart Automation** 
- **Fast Response**: Checks for dismissed jobs every 200ms for "instant" hiding
- **Keyword Scanning**: Scans for unwanted jobs every 3 seconds
- **Safe Delays**: 200ms delay between dismiss actions to avoid overwhelming LinkedIn
- **Auto-Stop**: Both features stop after 10 minutes to prevent infinite running

### **Full Control**
- **Independent Toggles**: Enable/disable each feature separately
- **Manual Actions**: Immediate control buttons for testing and one-time actions
- **Real-time Status**: Shows which features are active
- **Live Updates**: Changes apply immediately without page refresh

### **Customizable Keywords**
- **Editable List**: Full control over keywords via popup textarea
- **Auto-Save**: Keywords save automatically when you finish editing
- **Case Insensitive**: Keywords match regardless of capitalization

## Quick Start

### Installation
1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **Load unpacked** and select the extension folder
5. The LinkedIn Job Manager icon will appear in your toolbar

### First Use
1. Navigate to [LinkedIn Jobs](https://www.linkedin.com/jobs/)
2. Click the extension icon in your toolbar
3. Configure your preferences:
   - ✅ **Hide dismissed job cards** (enabled by default)
   - ⬜ **Auto-dismiss jobs with keywords** (disabled by default)
4. If using keyword dismissal, review and edit the keyword list as needed
5. The extension will start working automatically

## Interface Guide

### Status Display
- **"Hiding & Dismissing Active"**: Both features running
- **"Hiding Active"**: Only hiding dismissed jobs
- **"Dismissing Active"**: Only auto-dismissing keywords
- **"Disabled"**: Both features turned off
- **"Not on LinkedIn"**: Extension inactive (not on LinkedIn)

### Controls
- **Hide dismissed job cards**: Toggle to show/hide already dismissed jobs
- **Auto-dismiss jobs with keywords**: Toggle to enable automatic dismissal
- **Keywords textarea**: Edit your list of unwanted keywords (one per line)
- **Hide Dismissed Jobs Now**: Manual action to hide dismissed jobs immediately
- **Dismiss Keyword Jobs Now**: Manual action to dismiss keyword jobs immediately
- **Show Hidden Jobs**: Restore previously hidden job cards

## How It Works

### Hide Dismissed Jobs
1. Scans page every **200ms** for dismissed job cards
2. Identifies cards with `.job-card-job-posting-card-wrapper--dismissed` class
3. Hides the entire list item and marks it to avoid re-processing
4. Continues monitoring as you scroll and navigate

### Auto-Dismiss Keywords  
1. Scans page every **3 seconds** for dismiss buttons
2. Checks `aria-label` of each button against keyword list
3. Clicks matching dismiss buttons with 200ms delay between actions
4. Logs all dismissed jobs to console with matched keywords
5. Handles LinkedIn's dynamic content loading

### Smart Navigation
- Detects page changes within LinkedIn (single-page app)
- Automatically restarts functionality after navigation
- Maintains settings across page changes
- Cleans up properly when leaving LinkedIn

## Technical Details

### Files Structure
```
linkedin-job-manager/
├── manifest.json          # Extension configuration
├── popup.html             # User interface
├── popup.js               # Popup functionality  
├── content.js             # Main job management logic
├── background.js          # Background service worker
└── README.md              # This file
```

### Permissions
- `activeTab`: Access current tab when extension is used
- `scripting`: Execute scripts on LinkedIn pages
- `storage`: Save user preferences and keywords
- `host_permissions`: Access LinkedIn domains

### Browser Compatibility
- **Chrome**: Manifest V3 (recommended)
- **Edge**: Chromium-based versions
- **Other browsers**: May work but not officially supported

## Privacy & Security

- **No data collection**: Extension doesn't collect or transmit personal data
- **Local storage only**: Keywords and settings stored locally in browser
- **LinkedIn only**: Extension only runs on LinkedIn domains
- **Open source**: All code is visible and auditable

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

The extension is provided "as is" without warranty of any kind.
