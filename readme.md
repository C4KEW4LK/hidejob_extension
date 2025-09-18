# LinkedIn Job Manager Extension

A Chrome extension to streamline your LinkedIn job search by hiding dismissed jobs and automatically filtering out positions based on keywords and company names.

*This is something I put together for myself, to fit my use case, but thought others might find it useful.*

## Features

### **Advanced Job Filtering**
- **Hide Dismissed Jobs**: Instantly hides jobs you've already dismissed, keeping your feed clean and focused.
- **Keyword Filtering**: Automatically dismisses jobs based on a customizable list of keywords found in the job title.
- **Company Blocking**: Automatically dismisses jobs from companies you've added to your blocklist.

### **Interactive UI & Control**
- **Modern Popup Interface**: Manage all settings from a clean, intuitive popup with separate tabs for keywords and companies.
- **Undo Dismissals**: Accidentally dismissed a job? An "Undo" popup appears after manual dismissals, giving you a chance to take it back.
- **Live Updates**: Settings apply instantly without needing to reload the page.
- **Independent Toggles**: Enable or disable hiding, keyword filtering, and company blocking separately.

### **List Management**
- **Easy Keyword/Company Entry**: Add multiple keywords or companies at once, separated by commas or newlines.
- **Tag-Based Display**: View your lists as easy-to-manage tags, which can be removed individually.
- **Export & Clear**: Export your keyword or company lists to a text file for backup, or clear them with a single click.

### **Smart & Safe Automation**
- **Cross-Device Sync**: Syncs your settings and most recently dismissed jobs across devices.
- **SPA Navigation Support**: Works seamlessly with LinkedIn's dynamic navigation, automatically re-initializing on page changes.
- **Safe & Efficient**: Built to be lightweight and uses safe delays between actions to avoid overwhelming LinkedIn.

## Quick Start

### Installation
1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the extension folder.
5. The LinkedIn Job Manager icon will appear in your toolbar.

### First Use
1. Navigate to a [LinkedIn Jobs](https://www.linkedin.com/jobs/) page.
2. Click the extension icon in your toolbar to open the popup.
3. Configure your preferences using the main toggles.
4. Navigate to the **Keywords** or **Companies** tabs to add items to your filter lists.
5. The extension will start working immediately based on your settings.

## Interface Guide

### Main Toggles
- **Hide Dismissed Jobs**: Enable to automatically hide jobs you have dismissed.
- **Filter by Keywords**: Enable to automatically dismiss jobs based on your keyword list.
- **Filter by Companies**: Enable to automatically dismiss jobs based on your company blocklist.

### Keywords & Companies Tabs
- **Tabbed Navigation**: Switch between managing your keyword list and your company blocklist.
- **Input Area**: Add new items by typing or pasting them into the textarea. You can add multiple items at once by separating them with a comma or a new line.
- **Tags Container**: Your added keywords and companies are displayed as individual tags. Click the `×` on any tag to remove it.
- **List Actions**:
    - **Export**: Downloads your current list as a `.txt` file.
    - **Clear All**: Removes all items from the current list.

## How It Works

The extension's content script runs on LinkedIn job pages and monitors the page for changes using a `MutationObserver`.

- **Hiding**: It identifies job cards that have been dismissed (either by you or the script) and hides them from view.
- **Filtering**: It scans job titles and company names against your lists. If a match is found, it programmatically clicks the "Dismiss" button for that job.
- **Undo Feature**: It listens for manual clicks on "Dismiss" buttons. When detected, it prevents the job from being hidden immediately and instead shows a notification with an "Undo" button, giving you time to reverse the action.
- **Storage**: The extension uses `chrome.storage.sync` to save your settings and lists, allowing them to be synced across your devices. To work within Chrome's storage limitations, the list of recently dismissed job IDs is also synced. These IDs are Base64 encoded to save space and are split into multiple chunks (each under 8KB) to meet storage quotas. A larger, complete list of dismissed jobs is kept in `chrome.storage.local` for performance.

## Technical Details

### File Structure
```
hidejob_extension-main/
├── manifest.json          # Extension configuration
├── background.js          # Background service worker (manages storage, alarms)
├── content.js             # Core logic that runs on LinkedIn pages
├── popup/
│   ├── popup.html         # The popup's HTML structure
│   └── popup.js           # The popup's UI logic and event handling
└── README.md              # This file
```

## License

This project is open source and available under the [MIT License](LICENSE).

## Disclaimer

This extension is provided "as is" without warranty of any kind. It is not affiliated with, endorsed, or sponsored by LinkedIn.
