import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  { ignores: ['**/.next/**', '**/generated/**', '**/node_modules/**', '**/dist/**', 'frontend/public/**'] },
  js.configs.recommended, ...ts.configs.recommended
);
