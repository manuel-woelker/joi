# Joi UI

SolidJS workspace for creating and organizing customizable application views.

## How does the workspace work?

A saved view combines a reusable query with a reusable presentation. Queries
select and sort records; presentations define table or list layout, fields, and
density. The same definition can be shared by multiple views, or copied when a
view needs private customization.

The left navigation supports folders, favorites, reordering, moving,
duplication, deletion with undo, and keyboard navigation. View URLs use the
`#/views/<id>` hash format.

Workspace definitions are currently stored in browser `localStorage`. The
included reset command restores the example ticket workspace. Ticket records
are loaded from the backend's `POST /api/tickets/query` action and validated
before they are converted from columnar data. Permissions, sharing, and
workspace synchronization are intentionally not yet implemented.

## How do I run it?

```sh
pnpm install
pnpm dev
```

During development, Vite proxies `/api` requests to the joix-tickets backend at
`http://127.0.0.1:3000`. Start that service separately with `nao joix-tickets`.

## How do I check and build it?

```sh
pnpm check
pnpm test
pnpm build
```

From the repository root, `nao ui` starts the same development server at
`http://localhost:5173`.
