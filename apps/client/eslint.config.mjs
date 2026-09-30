import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { FlatCompat } from '@eslint/eslintrc';
import { plugin as shadcn } from '@shadcn/lint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
   baseDirectory: __dirname,
   resolvePluginsRelativeTo: dirname(require.resolve('eslint-config-next')),
});

const eslintConfig = [
   ...compat.extends('next/core-web-vitals', 'next/typescript'),
   {
      files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
      plugins: { shadcn },
   },
   {
      // Vendored bazza/ui data-table-filter (kept close to upstream for easy updates)
      files: ['components/data-table-filter/**/*.{ts,tsx}'],
      rules: {
         '@typescript-eslint/no-unused-vars': 'off',
         '@typescript-eslint/no-explicit-any': 'off',
         '@typescript-eslint/no-this-alias': 'off',
         'react-hooks/rules-of-hooks': 'off',
         'react-hooks/exhaustive-deps': 'off',
      },
   },
];

export default eslintConfig;
