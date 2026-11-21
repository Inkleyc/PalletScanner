// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const paletteImportBan = {
  importNames: ['DayPalette', 'DeepPalette', 'WorkOrderPalette', 'AppPalette'],
  message:
    'Palettes are the theme context\u2019s job: use useAppPalette()/useAppTheme() from "@/lib/app-theme" instead of importing a palette directly.',
};

const retiredModuleBans = [
  {
    name: '@/constants/theme',
    message:
      'constants/theme is retired. Use the theme context from "@/lib/app-theme".',
  },
  {
    name: '@/hooks/use-theme-color',
    message:
      'use-theme-color is retired. Use the theme context from "@/lib/app-theme".',
  },
  {
    name: '@/components/themed-text',
    message:
      'themed-text is retired. Use the theme context from "@/lib/app-theme".',
  },
  {
    name: '@/components/themed-view',
    message:
      'themed-view is retired. Use the theme context from "@/lib/app-theme".',
  },
];

module.exports = defineConfig([
  {
    ignores: ['dist/**', 'web-build/**', '.expo/**'],
  },
  expoConfig,
  {
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
        },
      },
    },
    rules: {
      'import/no-unresolved': 'off',
    },
  },
  {
    // One master design source: screens and components must consume the
    // palette/shape through lib/app-theme, never by importing a palette or
    // a retired template-theming module directly. lib/ and constants/ are
    // intentionally outside this block: lib/app-theme.tsx is the one place
    // allowed to import the palettes.
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@/constants/app-palette', ...paletteImportBan },
            ...retiredModuleBans,
          ],
          patterns: [
            { group: ['**/constants/app-palette'], ...paletteImportBan },
            {
              group: [
                '**/constants/theme',
                '**/hooks/use-theme-color',
                '**/components/themed-text',
                '**/components/themed-view',
              ],
              message:
                'That theming module is retired. Use the theme context from "@/lib/app-theme".',
            },
          ],
        },
      ],
    },
  },
]);
