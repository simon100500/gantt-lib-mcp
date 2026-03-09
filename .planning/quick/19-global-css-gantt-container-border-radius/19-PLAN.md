---
phase: quick-19
plan: 19
type: execute
wave: 1
depends_on: []
files_modified: [packages/web/src/global.css, packages/web/src/main.tsx]
autonomous: true
requirements: []
user_setup: []

must_haves:
  truths:
    - "CSS variable --gantt-container-border-radius exists with value 0px"
    - "global.css is imported in main.tsx"
    - "Variable is available globally for gantt container styling"
  artifacts:
    - path: "packages/web/src/global.css"
      provides: "Global CSS variables for Gantt chart"
      min_lines: 1
    - path: "packages/web/src/main.tsx"
      provides: "Entry point with global.css import"
      contains: "import './global.css'"
  key_links:
    - from: "packages/web/src/main.tsx"
      to: "packages/web/src/global.css"
      via: "ES module import"
      pattern: "import './global.css'"
---

<objective>
Add global.css file with --gantt-container-border-radius CSS variable set to 0px

Purpose: Provide a global CSS variable for controlling Gantt chart container border radius
Output: New global.css file with CSS variable, imported in main.tsx
</objective>

<execution_context>
@C:/Users/Volobuev/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/Volobuev/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@packages/web/src/index.css
@packages/web/src/main.tsx

# Current CSS structure
- index.css contains Tailwind CSS + shadcn/ui theme variables
- main.tsx imports index.css and gantt-lib/styles.css
- No global.css exists yet
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create global.css with CSS variable</name>
  <files>packages/web/src/global.css</files>
  <action>
    Create packages/web/src/global.css with the following content:

    :root {
      --gantt-container-border-radius: 0px;
    }

    This CSS variable can be used to control the border radius of the Gantt chart container.
  </action>
  <verify>
    <automated>test -f packages/web/src/global.css && grep -q "gantt-container-border-radius" packages/web/src/global.css</automated>
  </verify>
  <done>File packages/web/src/global.css exists with --gantt-container-border-radius: 0px</done>
</task>

<task type="auto">
  <name>Task 2: Import global.css in main.tsx</name>
  <files>packages/web/src/main.tsx</files>
  <action>
    Add import statement for global.css in packages/web/src/main.tsx

    Insert the line after the existing index.css import:
    import './global.css';

    The import order should be:
    1. index.css (Tailwind + shadcn/ui)
    2. global.css (Gantt-specific variables)
    3. gantt-lib/styles.css (Gantt library styles)
  </action>
  <verify>
    <automated>grep -q "import './global.css'" packages/web/src/main.tsx</automated>
  </verify>
  <done>main.tsx imports global.css after index.css</done>
</task>

</tasks>

<verification>
- File packages/web/src/global.css exists with --gantt-container-border-radius: 0px
- main.tsx imports global.css in correct order
- CSS variable is globally available for use in components
</verification>

<success_criteria>
- global.css file created in packages/web/src/
- CSS variable --gantt-container-border-radius set to 0px
- global.css imported in main.tsx
- Application builds without errors
</success_criteria>

<output>
After completion, create `.planning/quick/19-global-css-gantt-container-border-radius/19-SUMMARY.md`
</output>
