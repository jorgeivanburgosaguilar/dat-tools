# DAT Tools

> **Privacy-First Client-Side Utilities for Developers**

A collection of browser-based tools designed to run entirely on the client side with **zero server-side processing**. Perfect for developers working under strict NDAs or handling sensitive data, like those working on the DAT platform.

## 🔒 Privacy & Security

All tools in this repository are built with privacy as the top priority:

- ✅ **100% Client-Side Processing** - All data processing happens in your browser
- ✅ **No Server Communication** - Your data never leaves your machine
- ✅ **No Analytics or Tracking** - We don't collect any information
- ✅ **Self-Hostable** - Run locally via Docker or host on your own infrastructure
- ✅ **NDA-Safe** - Ideal for projects with strict confidentiality requirements

## 🚀 Current Tools

### Stopwatch
A clean, ad-free stopwatch application built with Svelte. No distractions, no data collection—just a simple, functional timer.

## 📋 Roadmap

### Planned Features
- [ ] JSON Parser/Validator
- [ ] Code/Text Diff Tool
- [ ] Word Counter
- [ ] Additional utility tools as needed

### Development Tasks
- [ ] Refactor components for better modularity
- [ ] Code review and optimization (initial version was rapidly prototyped)
- [ ] Improve UI/UX consistency across tools
- [ ] Add comprehensive documentation

## 🛠️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- pnpm (recommended) or npm

### Installation

```bash
# Clone the repository
git clone https://github.com/jorgeivanburgosaguilar/dat-tools.git
cd dat-tools

# Install dependencies
pnpm install

# Run development server
pnpm dev
```

### Docker Deployment

```bash
# Build and run with Docker Compose
docker-compose up -d
```

The application will be available at `http://localhost:5173` (development) or your configured port.

## 🎯 Project Goals

1. **Privacy First** - Never compromise user data security
2. **Client-Side Only** - All processing happens in the browser
3. **No Dependencies on External Services** - Fully self-contained
4. **Developer-Friendly** - Built by developers, for developers
5. **NDA-Compliant** - Safe for use with confidential information

## 🤝 Contributing

Contributions are welcome! Whether it's bug fixes, new tools, or documentation improvements, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the terms specified in the [LICENSE](LICENSE) file.

## 👤 Author

**Jorge Ivan Burgos Aguilar**

---

*Built with privacy and security in mind for the DAT community and beyond.*
