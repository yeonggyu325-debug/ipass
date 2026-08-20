# Frontend module map

`public/index.html` is being migrated from a single-file application to feature-oriented modules.

## Core

- `core/config.js`: Firebase key, production API origin, session key.
- `core/api.js`: token refresh, authenticated API client, public API client, request cache.
- `core/auth.js`: sign-in, session restore, account-state routing, sign-out.
- `core/router.js`: page visibility, navigation, route authorization.
- `core/ui.js`: escaping, status tags, date formatting, shared modal helpers.

## Components

- `components/header.js`: GNB, mobile menu, user menu, unread badge.
- `components/notice-popup.js`: public notice popup and daily dismissal.

## Features

- `features/home.js`: portal home, notices, annual i-PaSS overview.
- `features/ipass.js`: evaluation list/detail and annual score administration.
- `features/committee.js`: committee list, meeting editor, attendance and annual-score synchronization UI.
- `features/admin.js`: dashboard, registrations, accounts and notice administration.

## Styles

- `styles/tokens.css`: shared design tokens.
- `styles/base.css`: reset, typography, form controls and shared buttons.
- `styles/layout.css`: login, header, GNB and responsive shell.
- `styles/components.css`: modal, card, tag, table and shared components.
- `styles/home.css`, `styles/ipass.css`, `styles/committee.css`, `styles/admin.css`: feature styles.

The first commit creates the shared module boundary. Subsequent extraction commits load these modules from `index.html` and remove duplicated inline code without changing portal behavior.
