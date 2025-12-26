# Pre-commit Check Fixes

I have resolved the ESLint errors that caused your commit to fail.

## 1. ESLint & TypeScript Fixes

- **`src/App.tsx`**: Removed unused imports (`useLocation`) and fixed `ThemeToggle` usage.
- **`src/components/Editor.tsx`**: Removed unused imports (`Card`) and fixed `useEffect` dependency warnings.
- **`src/components/layout/Sidebar.tsx`**: Removed unused imports (`User`) and fixed incorrect property access on `useThemeStore` (`mode` vs `theme`).
- **`src/components/layout/AppLayout.test.tsx`**: Removed unused imports (`fireEvent`), added missing props for tests, and fixed type definitions for `jest-dom`.
- **`src/components/ThemeToggle.tsx`**: Updated component to accept `className` prop, fixing the type error in `App.tsx`.

## 2. Verification

- Ran `npm run lint` - **Passed** (0 warnings).
- Ran `npm run test` - **Passed** (All tests green).

You can now retry your commit.
