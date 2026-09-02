import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [tailwindcss(), sveltekit()],
  test: {
    expect: { requireAssertions: true },
    projects: [
      {
        extends: './vite.config.js',
        test: {
          name: 'client',
          browser: {
            enabled: true,
            // clipboard-write/-read: several tools (Markdown Preview, JSON Validator, and the
            // Agent Trajectory Viewer's code blocks) have a "Copy" button backed by
            // navigator.clipboard.writeText(); Chromium denies that call by default in an
            // automated context, so tests covering it need the permission granted up front.
            provider: playwright({
              contextOptions: { permissions: ['clipboard-write', 'clipboard-read'] }
            }),
            instances: [{ browser: 'chromium', headless: true }]
          },
          include: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.browser.{test,spec}.{js,ts}'],
          exclude: ['src/lib/server/**']
        }
      },

      {
        extends: './vite.config.js',
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/**/*.{test,spec}.{js,ts}'],
          exclude: ['src/**/*.svelte.{test,spec}.{js,ts}', 'src/**/*.browser.{test,spec}.{js,ts}']
        }
      }
    ]
  }
});
