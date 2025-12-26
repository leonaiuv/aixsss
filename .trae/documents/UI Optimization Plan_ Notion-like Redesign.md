# UI Optimization Plan: "Notion-like" Professional Design

This plan outlines the steps to transform the current UI into a cleaner, more professional interface inspired by Notion. The focus is on minimalism, improved typography, and a sidebar-based navigation structure.

## 1. Design System Update (Global Styles)

**Objective**: Establish a neutral, professional color palette and typography.

- **Update `tailwind.config.js` & `index.css`**:
  - Replace the current "Indigo/Purple" primary theme with a "Slate/Gray" monochrome theme (Notion style).
  - **Colors**:
    - `primary`: Dark Slate (almost black) for strong actions.
    - `background`: Pure white or very light gray (`#FBFBFB`) for the app background.
    - `muted/secondary`: Light grays for sidebars and secondary elements.
    - `border`: Very subtle light gray.
  - **Typography**: Ensure `Inter` or system sans-serif stack is used with relaxed line heights.
  - **Shadows**: Remove heavy drop shadows; use subtle borders or very faint shadows for depth.
  - **Radius**: Standardize on `sm` or `md` radius (slightly squared) rather than large rounded corners.

## 2. Layout Architecture Refactor

**Objective**: Move from a top-navbar layout to a professional sidebar layout.

- **Create `src/components/layout/AppLayout.tsx`**:
  - **Sidebar**:
    - Collapsible left sidebar (width ~240px).
    - Contains: App Logo (minimal), Navigation (Projects, Search), User Profile/Settings at the bottom.
    - Active state styling: Light gray background with dark text (no gradients).
  - **Main Content Area**:
    - Minimal top bar containing **Breadcrumbs** (e.g., "Projects / My Comic / Editor").
    - Clean, centered content container.
- **Refactor `App.tsx`**:
  - Remove the existing `<header>` with gradient backgrounds.
  - Wrap the application routes in the new `AppLayout`.

## 3. Component Refinements

**Objective**: Align key views with the new design language.

- **Project List (`ProjectList.tsx`)**:
  - Remove gradient buttons.
  - Use a clean table or grid layout for projects with minimal card styling (flat borders).
  - Simplify the "Search/Filter" bar to look like Notion's database filters.
- **Editor Workspace (`Editor.tsx`)**:
  - **Steps Navigation**: Refine the left "Steps" panel to integrate seamlessly with the main layout or become a secondary minimalist column.
  - **Canvas**: Increase whitespace around the editing areas.
  - **Cards**: Remove heavy shadows from content containers; use simple borders.

## 4. Test-Driven Development (TDD)

**Objective**: Ensure the new layout is robust.

- **Create `src/components/layout/AppLayout.test.tsx`**:
  - Verify Sidebar renders correct navigation items.
  - Verify Main Content area renders children.
  - Verify Sidebar collapse/expand functionality (if implemented).
- **Regression Testing**:
  - Ensure routing still works correctly with the new layout.

## Execution Order

1.  **Test**: Write tests for the new `AppLayout`.
2.  **Implementation**: Create `AppLayout` and `Sidebar` components.
3.  **Refactor**: Apply the new layout to `App.tsx`.
4.  **Styling**: Update `index.css` and Tailwind config for the "Notion" look.
5.  **Refinement**: Update `ProjectList` and `Editor` specific styles.
