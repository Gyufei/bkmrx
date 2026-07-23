import { Crepe } from '@milkdown/crepe';
import { LanguageDescription } from '@codemirror/language';
import { javascript } from '@codemirror/lang-javascript';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { vue } from '@codemirror/lang-vue';
import { markdown as cmMarkdown } from '@codemirror/lang-markdown';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';

export const MilkdownCreapConfig = {
  features: {
    [Crepe.Feature.Latex]: false,
    [Crepe.Feature.ImageBlock]: false,
  },
  featureConfigs: {
    [Crepe.Feature.CodeMirror]: {
      languages: [
        LanguageDescription.of({
          name: 'JavaScript',
          alias: ['js', 'javascript', 'ecmascript'],
          extensions: ['js', 'mjs', 'cjs', 'jsx'],
          load() {
            return Promise.resolve(javascript());
          },
        }),
        LanguageDescription.of({
          name: 'TypeScript',
          alias: ['ts', 'typescript'],
          extensions: ['ts', 'tsx', 'mts'],
          load() {
            return Promise.resolve(javascript({ typescript: true }));
          },
        }),
        LanguageDescription.of({
          name: 'C',
          alias: ['c', 'c++', 'cpp', 'cc'],
          extensions: ['c', 'h', 'cpp', 'cc', 'hpp'],
          load() {
            return Promise.resolve(cpp());
          },
        }),
        LanguageDescription.of({
          name: 'Rust',
          alias: ['rs', 'rust'],
          extensions: ['rs'],
          load() {
            return Promise.resolve(rust());
          },
        }),
        LanguageDescription.of({
          name: 'Vue',
          alias: ['vue'],
          extensions: ['vue'],
          load() {
            return Promise.resolve(vue());
          },
        }),
        LanguageDescription.of({
          name: 'Markdown',
          alias: ['md', 'markdown'],
          extensions: ['md', 'markdown'],
          load() {
            return Promise.resolve(cmMarkdown());
          },
        }),
        LanguageDescription.of({
          name: 'CSS',
          alias: ['css', 'pcss'],
          extensions: ['css', 'scss'],
          load() {
            return Promise.resolve(css());
          },
        }),
        LanguageDescription.of({
          name: 'JSON',
          alias: ['json', 'jsonc'],
          extensions: ['json', 'jsonc'],
          load() {
            return Promise.resolve(json());
          },
        }),
        LanguageDescription.of({
          name: 'HTML',
          alias: ['html', 'htm', 'xhtml'],
          extensions: ['html', 'htm', 'xhtml'],
          load() {
            return Promise.resolve(html());
          },
        }),
        LanguageDescription.of({
          name: 'Python',
          alias: ['py', 'python'],
          extensions: ['py'],
          load() {
            return Promise.resolve(python());
          },
        }),
        LanguageDescription.of({
          name: 'SQL',
          alias: ['sql'],
          extensions: ['sql'],
          load() {
            return Promise.resolve(sql());
          },
        }),
      ],
    },
  },
}