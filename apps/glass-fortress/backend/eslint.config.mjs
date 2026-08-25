import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettierConfig,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Relax a few rules that conflict with our patterns
    rules: {
      // ignoreRestSiblings restores ESLint's own default, dropped by naming
      // options here. It exempts the binding in `const { x, ...rest } = obj` —
      // omitting a property by destructuring, where the name is unused BY
      // CONSTRUCTION. Used to strip a discriminant while keeping a union's
      // per-variant shape, which rebuilding the object field-by-field loses.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
