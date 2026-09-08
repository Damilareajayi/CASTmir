# Installing CASTmir

CASTmir isn't in the Chrome Web Store yet — during the pilot, it's installed
directly from a file the research team gives you. That's why searching for
it in your browser won't find anything. It takes about 2 minutes to set up.

**Works in:** Chrome, Microsoft Edge, Brave, and other Chromium-based
browsers (all use the same steps below).

## Step 1 — Get the extension folder

You'll receive a file called **`castmir-extension.zip`**.

1. Save it somewhere you'll remember — e.g. your Desktop or Documents.
2. Right-click the zip file → **Extract All...** (Windows) or double-click
   it (Mac) → choose a location.
3. You should now have a folder called `castmir-extension` containing files
   like `manifest.json`, `popup.html`, and an `icons` folder. Keep this
   folder where it is — don't delete it after installing, the browser reads
   from it directly.

## Step 2 — Open your browser's extensions page

- **Chrome**: type `chrome://extensions` into the address bar and press Enter.
- **Edge**: type `edge://extensions` into the address bar and press Enter.
- **Brave**: type `brave://extensions` into the address bar and press Enter.

## Step 3 — Turn on Developer mode

Look for a **Developer mode** toggle, usually in the top-right corner of the
page. Turn it **on**. Three new buttons will appear: *Load unpacked*, *Pack
extension*, *Update*.

## Step 4 — Load CASTmir

1. Click **Load unpacked**.
2. In the file picker, navigate to and select the `castmir-extension` folder
   from Step 1 (select the folder itself, not a file inside it).
3. Click **Select Folder**.

CASTmir should now appear in your extensions list with the mascot-head icon.

## Step 5 — Pin it to your toolbar (recommended)

Click the puzzle-piece icon (🧩) in your browser's toolbar, find **CASTmir**
in the dropdown, and click the pin icon next to it. This keeps the CASTmir
icon visible at all times instead of buried in the puzzle-piece menu.

## Step 6 — Turn it on for an AI site

1. Visit a supported site: **ChatGPT, Claude, Gemini, Copilot, or
   Perplexity**.
2. Click the CASTmir icon in your toolbar. It'll be gray/muted at first —
   that means it isn't authorized on this site yet.
3. Click **Authorize CASTmir on this site**. Your browser will show a native
   permission prompt — approve it.
4. Read the consent screen — it explains exactly what CASTmir captures and
   what it's used for — then enter **your RECAST team alias** (a name/handle
   you choose — it's how the research team recognizes your activity across
   devices without needing your real name) and click **I consent — start
   monitoring**.

The icon turns to full garnet color with a green dot once it's active —
that means CASTmir is monitoring this tab. Click the icon any time after
that to jump straight to your personal dashboard.

## Troubleshooting

- **"Manifest file is missing or unreadable"** — you selected a file instead
  of the folder in Step 4. Go back and select the whole `castmir-extension`
  folder.
- **The icon doesn't change color on a supported site** — try reloading the
  page after installing the extension; the icon updates on page load/tab
  switch.
- **Chrome shows "This extension is not from the Chrome Web Store" or a
  similar warning** — this is expected during the pilot, since CASTmir
  hasn't been published there yet. It's safe to proceed for pilot testing.
- **You moved or deleted the `castmir-extension` folder after installing**
  — the extension will stop working. Re-extract the zip and use *Load
  unpacked* again if that happens.

## Not yet supported

- **Firefox**: the extension is built to support it (same codebase via a
  compatibility layer) but hasn't been tested in a real Firefox install yet.
- **Safari**: not supported in this pilot — Safari requires a separate
  packaging process we haven't built yet.
