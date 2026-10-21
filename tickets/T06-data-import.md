# T06 — Step ② Data: sample, Excel import/template, edit tables
**Status:** TODO
**Lane:** A · **Prereqs:** T05 · **Branch:** t06-data

## Goal
Admin gets all college data in within a minute.

## Scope / files
- `web/src/features/data/DataStep.tsx`, `excel.ts`.
- Three entry paths at the top as cards:
  1. **Load sample college** (one click, toast "Loaded 9 sections, 25 teachers…").
  2. **Download template** — `.xlsx` with sheets and header rows + 2 example rows each:
     - `Teachers`: Name, Department
     - `Rooms`: Name, Type (classroom/lab), Department (blank = shared)
     - `Sections`: Name, Department, Lab Batches
     - `Courses`: Section, Subject, Teacher, Lectures/Week, Lab Sessions/Week, Lab Length, Lab Room, Batch Teachers (comma-separated)
  3. **Upload** `.xlsx` (or CSVs named like the sheets). Departments are created from names found.
     IDs = slugified names. **Row-level errors** listed before applying, e.g.
     `Courses row 7: teacher "Sharma" not found in Teachers sheet`. Apply only if no errors.
- Below: tabs Teachers / Rooms / Sections / Courses with simple editable tables (add, edit inline, delete).
  *(Cut-able: if behind, make tables read-only.)*
- Summary bar: counts + total required periods per section vs available teaching slots, warning if a
  section needs more periods than exist.
- ⓘ tooltips: Lab Batches, Lab Length, Lab Room, Batch Teachers, Department blank = shared.

## Tests (keep light)
- `excel.test.ts`: parse a workbook built in-test with SheetJS → expected entities; one unknown-teacher error.

## Done when
- [ ] Sample load, template download, upload with errors all work
- [ ] Committed: `T06: data step with excel import`
