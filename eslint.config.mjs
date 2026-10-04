import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'

// Platform boundary (CLAUDE.md 구조 원칙): only src/main, src/preload and
// src/platform/electron may touch Electron or Node.
const electronAndNode = [
  'electron',
  '@electron-toolkit/*',
  'fs',
  'fs/*',
  'path',
  'os',
  'child_process',
  'node:*'
]

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  {
    files: ['src/renderer/**/*.ts', 'src/core/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: electronAndNode, message: 'Use the platform interface (src/platform).' },
            {
              group: ['**/platform/electron', '**/platform/electron/*'],
              message: 'Import from src/platform, not a specific implementation.'
            }
          ]
        }
      ],
      'no-restricted-properties': [
        'error',
        { object: 'window', property: 'chordashBridge', message: 'Use the platform interface.' }
      ]
    }
  },
  {
    files: ['src/core/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: electronAndNode, message: 'core stays pure.' },
            { group: ['**/platform', '**/platform/*'], message: 'core stays pure.' }
          ]
        }
      ]
    }
  },
  eslintConfigPrettier
)
