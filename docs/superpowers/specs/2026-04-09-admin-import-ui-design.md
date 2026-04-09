# Admin Import UI — Design Spec

**Date:** 2026-04-09

---

## Overview

Add a `/admin/import` page to the admin section that lets admins bulk-load house data by uploading a file. The page auto-detects the import format from the file extension and routes to the appropriate API endpoint.

---

## Routes & Files

### `app/(app)/admin/import/page.tsx` (new)

Server component. Redirects to `/map` if the user is not an admin. Renders `<ImportClient />` with no props — all state is client-side.

### `app/(app)/admin/import/client.tsx` (new)

`'use client'` component. Owns all import state and logic (see UI section below).

### `app/(app)/layout.tsx` (modified)

Add an "Import" nav link, visible to admins only, alongside the existing "Admin" link.

---

## UI

### File Selection

A single `<input type="file">` accepting `.geojson` and `.csv`. No multi-file support.

Format is detected from the file extension on submit:
- `.geojson` → `POST /api/houses/import/geojson`
- `.csv` → `POST /api/houses/import`
- Anything else → show inline validation error: "Unsupported file type. Upload a .geojson or .csv file."

### Upload Button

Disabled until a file is selected. Clicking submits the file as `FormData` with key `file`.

### States

| State | Display |
|---|---|
| Idle | File picker + disabled upload button |
| File selected | File picker (showing filename) + enabled upload button |
| Uploading | Spinner + "Uploading…" text, button disabled |
| Done | Result card (see below) + "Upload another file" button to reset |
| Error | Error message + form remains usable for retry |

### Result Card

Shown after a successful response. Displays three counts:

- **Imported** — houses successfully written to the database
- **Skipped** — lines that could not be parsed or were duplicates
- **Total** — total lines processed

GeoJSON response includes `skipped`; CSV response does not (only `imported` and `total`). When `skipped` is absent, omit that row from the card.

### Error Handling

- Non-ok HTTP response: show `"Import failed. Please try again."` (or response body if it contains `{ error: string }`)
- Network error (fetch throws): show `"Network error. Check your connection and try again."`
- Unsupported file extension: show inline before submitting, do not hit the API

---

## Navigation

In `app/(app)/layout.tsx`, add an "Import" link after the "Admin" link, shown only when `role === 'admin'`:

```tsx
{role === 'admin' && (
  <Link href="/admin/import">Import</Link>
)}
```

The existing "Admin" link (`/admin/users`) remains unchanged. Only admins see "Import" (managers do not — the import endpoints require admin or manager, but the UI is admin-only for simplicity).

---

## Scope

- No progress bar — the response is returned after the full import completes
- No import history or audit log
- No drag-and-drop (standard file input only)
- No download of error rows
- Manager role cannot access the page (admin only, consistent with other admin pages)
