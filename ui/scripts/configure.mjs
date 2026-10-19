import { copyFile, writeFile } from 'node:fs/promises';

// JSON encoding keeps quotes, backslashes, and newlines in configuration values safe.
const serverUrl = process.env.BIBLER_SERVER_URL || 'http://localhost:3000';
const config = `globalThis.BIBLER_SERVER_URL = ${JSON.stringify(serverUrl)};\n`;
await writeFile(new URL('../src/assets/configuration.js', import.meta.url), config);

// Angular asset inputs must stay inside the UI workspace, even with hoisted dependencies.
await copyFile(new URL(import.meta.resolve('pdfjs-dist/build/pdf.worker.min.mjs')), new URL('../src/assets/pdf.worker.min.mjs', import.meta.url));
