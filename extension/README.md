# CounselReflect Chrome Extension

A Chrome extension that brings mental health conversation analytics to AI platforms. Analyze therapeutic conversations from Gemini, ChatGPT, and Claude with AI-powered metrics.

## ✨ Features

- 🎯 **Multi-Platform Support**: Works on Gemini, ChatGPT, and Claude
- 📊 **AI-Powered Analytics**: Evaluate conversations with customizable metrics
- 🎨 **Resizable Sidebar**: Adjustable width (320px-800px) with smooth drag handle
- 🌓 **Dark Mode**: Seamless dark/light theme support
- 🔄 **Real-time Scraping**: Extract conversations directly from AI platforms
- 📈 **Visual Dashboard**: Interactive charts and metrics visualization
- 💾 **Persistent Settings**: Saves your preferences and sidebar width

## 🚀 Quick Start

### Development Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Build the extension:**

   ```bash
   npm run build
   ```

   For development with auto-rebuild:

   ```bash
   npm run dev
   ```

3. **Load in Chrome:**
   - Open Chrome and go to `chrome://extensions/`
   - Enable "Developer mode" (top right)
   - Click "Load unpacked"
   - Select the `dist` folder from this project

## 📖 Usage

1. **Navigate** to Gemini, ChatGPT, or Claude
2. **Click** the CounselReflect extension icon in Chrome toolbar
3. **Scrape** the current conversation or load sample data
4. **Configure** your evaluation metrics
5. **Analyze** the conversation with AI-powered insights

## 🏗️ Project Structure

```
extension/
├── src/
│   ├── components/          # Extension-specific React UI components
│   ├── utils/               # Utility modules (scrapers, platform integration)
│   │   ├── scrapers.js      # Platform scraping logic
│   │   └── element_helpers.js
│   ├── App.tsx              # Main React app (Sidebar entry)
│   ├── background.js        # Background service worker
│   ├── content.js           # Content script (orchestrator)
│   ├── index.css            # Global styles
│   └── sidebar.tsx          # Sidebar Bootstrap
├── public/
│   ├── icons/               # Extension icons
│   └── logo.png             # App logo
├── manifest.json            # Chrome extension manifest
├── vite.config.js           # Vite configuration
├── tailwind.config.js       # Tailwind configuration
└── package.json             # Dependencies (imports `@counselreflect/shared`)

**Note:** Core UI components, services, and contexts are imported from the `@counselreflect/shared` package to ensure consistency with the CounselReflect web frontend.
```

## 🎨 Customization

### Sidebar Width

The sidebar is resizable by dragging the left edge. Default settings:

- **Default**: 400px
- **Minimum**: 320px
- **Maximum**: 800px
- **Persistence**: Width is saved to localStorage

### Styling

- Edit components in `src/components/` to customize UI
- Modify Tailwind classes for styling
- Update `src/index.css` for global styles

### Scraping

Add support for new platforms by:

1. Creating a new scraper function in `src/utils/scrapers.js`
2. Adding platform detection logic
3. Updating `manifest.json` to include the new domain

## 🔧 Technical Details

### Architecture

- **Content Script**: Injects sidebar and manages page scraping
- **Background Script**: Handles extension icon clicks
- **Sidebar**: React app running in an iframe
- **Communication**: Uses `window.postMessage` for iframe ↔ content script

### Platform Scraping

Each platform has a dedicated scraper:

- **Gemini**: `.conversation-container` selectors
- **ChatGPT**: `article[data-testid]` selectors
- **Claude**: `[data-testid="user-message"]` selectors

### Build Process

- **Vite**: Bundles React app and scripts
- **Tailwind CSS**: Utility-first styling
- **TypeScript**: Type-safe development
- **Static Copy**: Copies manifest and assets to dist

## 📦 Building for Production

```bash
npm run build
```

The production-ready extension will be in the `dist` folder, ready to:

- Load as unpacked extension
- Package for Chrome Web Store
- Distribute to users

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Development build with watch mode
npm run dev

# Production build
npm run build

# Preview build (if configured)
npm run preview
```

## 🌐 Supported Platforms

| Platform | URL Pattern         | Status       |
| -------- | ------------------- | ------------ |
| Gemini   | `gemini.google.com` | ✅ Supported |
| ChatGPT  | `chatgpt.com`       | ✅ Supported |
| Claude   | `claude.ai`         | ✅ Supported |

## 📝 License

This project is part of the CounselReflect mental health analytics suite.

## 🤝 Contributing

Contributions are welcome! Please ensure:

- Code follows existing patterns
- TypeScript types are properly defined
- Tailwind classes are used for styling
- Changes are tested across all supported platforms
