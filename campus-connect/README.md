# CampusConnect

Event management for a college: official club/committee events (registration, teams, multi-round tracking, document submissions) plus informal student meetups with a vote system, an announcement banner, and an admin dashboard. Data is mirrored live to a Google Sheet.

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Needs Node 18+. The database is `data/db.json` (created and seeded on first run). Delete it to reset.

## Demo logins

| Role | Email | Password |
|---|---|---|
| Student | demo@college.edu | Student@123 |
| Club/committee admin | `<club>@college.edu`, e.g. cultural@, appli@, infra@, sports@, ecell@, adaa@ ... | Admin@123 |
| Super admin (all clubs, users) | superadmin@college.edu | Admin@123 |

Change the admin password before real use: `ADMIN_PASSWORD=... npm start` on a fresh database (or use the Users tab > Reset password).

## What is covered

- **Login + CAPTCHA**: email + password, scrypt-hashed with per-user salt, server-side sessions (HttpOnly cookie), 5-failure lockout, image CAPTCHA on login and sign-up (single use, 5 min expiry).
- **Validation**: client-side JS on every form, repeated server-side (the server never trusts the client).
- **CRUD**: events (create/edit/delete/promote/close), teams (rename/eliminate/remove), participants (remove), announcements, student meetups, users (super admin: reset password/delete), submissions (score + feedback).
- **Display**: cards, tables, dashboard stats, filters (category, mode), sorting, search, hero carousel.
- **Rounds**: each event has ordered rounds (live or document-submission). Admin advances the round, teams upload a link/file for submission rounds, admin scores them.

## Google Sheet sync (live)

The server pushes all tables (Users without password hashes, Events, Registrations, Teams, Submissions, Meetups, Announcements) after every change. Setup, one time:

1. Open your sheet > Extensions > Apps Script, paste `apps-script/Code.gs`, set `SECRET`.
2. Deploy > New deployment > Web app > Execute as **Me**, access **Anyone**. Copy the URL.
3. Start the server with:
   ```bash
   SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/.../exec" SHEETS_SECRET="your-secret" npm start
   ```
4. Admin > Google Sheet tab shows status and a "Sync now" button.

## Config

`PORT`, `ADMIN_PASSWORD`, `SHEETS_WEBHOOK_URL`, `SHEETS_SECRET`, `DATA_DIR`.

## Notes

- Hosting needs a server with a persistent disk (Render, Railway, a VPS). Serverless platforms with read-only/ephemeral disks will lose `data/`.
- Email-OTP verification is not included (needs an SMTP provider). Sign-up is email + college ID + password + CAPTCHA.
