# Data Annotation Tech Tools (DAT Tools)

A collection of privacy-first, client-side browser utilities for annotators. All processing happens entirely in your browser — your data never leaves your machine.

Ideal for teams working under strict NDAs or handling sensitive information.

## Features

- 100% client-side processing with zero server communication
- No analytics, tracking, or external dependencies
- Self-hostable via Docker

## Tools

| Tool                  | Description                | Status    |
| --------------------- | -------------------------- | --------- |
| Stopwatch             | Clean, ad-free timer       | Available |
| JSON Parser/Validator | Parse and validate JSON    | Planned   |
| Code/Text Diff        | Compare text side-by-side  | Planned   |
| Word Counter          | Count words and characters | Available |
| Markdown Preview      | Write and preview markdown | Available |

## Getting Started

### Prerequisites

- Node.js v24+
- pnpm (recommended) or npm

### Development

```bash
git clone https://github.com/jorgeivanburgosaguilar/dat-tools.git
cd dat-tools
pnpm install
pnpm dev
```

### Docker

```bash
docker compose up -d
```

## Contributing

Contributions are welcome — bug fixes, new tools, or documentation improvements. Open an issue or submit a pull request.

## License

See [LICENSE](LICENSE).

## Author

Jorge Ivan Burgos Aguilar
