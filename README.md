# Google Play Store Classic UI

A web recreation of the old Google Play Store interface, built entirely using the provided `res/` resources (extracted from an old Play Store APK).

## Features

- Classic green header and card-based app layout
- Multiple sections: Home, Apps, Games, Movies, Books
- Responsive design with bottom navigation on mobile
- PWA ready (manifest.json + Service Worker)
- Search functionality
- Uses original image assets from the `res/` folder

## Project Structure

```
play-store-classic/
├── index.html          # Main application
├── manifest.json       # PWA manifest
├── sw.js               # Service Worker for offline support
├── README.md           # This file
└── res/                # Original Android resources (images, layouts, colors)
    ├── *.png
    ├── *.webp
    ├── *.svg
    ├── *.xml
    └── color/
```

## How to Use

1. Clone or download this repository.
2. Open `index.html` in a modern web browser.
3. For PWA installation:
   - Serve the files via a local server (e.g., `python -m http.server` or Live Server).
   - The service worker will cache assets for offline use.

## Notes

- The `res/` folder contains thousands of original resources from the old Google Play Store (package: com.android.vending / finsky).
- Many filenames are obfuscated as they come from decompiled Android resources.
- App icons in the demo use sample images from `res/`. You can map specific assets to real apps by inspecting the folder.
- Layout XML files are in Android binary XML format and are included for reference.
- This is a static frontend recreation for educational/nostalgia purposes.

## Running Locally

```bash
# Using Python
cd play-store-classic
python3 -m http.server 8080

# Then open http://localhost:8080
```

## Customization

To better match specific screens from the original UI:
1. Browse the `res/` folder for relevant icons and backgrounds.
2. Update the `sampleApps` array in `index.html` with desired image paths.
3. Extend CSS to match colors found in `res/color/` XML files.

## License

Assets belong to Google. This project is for demonstration only. Do not distribute the original resources commercially.
