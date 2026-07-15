# Mobile Companion Data Model

The Android companion app uses the same Firestore state document as the web app.

## State Document

Path: `users/{uid}/data/state`

Relevant fields for the companion app:

| Field | Type | Description |
|---|---|---|
| `todos` | `Todo[]` | Task list shared with the web app |
| `scheduleEntries` | `ScheduleEntry[]` | Date-specific schedule assignments |
| `scheduleView` | `"week" \| "month"` | Last-used calendar mode |
| `scheduleWeekStart` | `YYYY-MM-DD` | Current week cursor |
| `scheduleMonth` | `YYYY-MM` | Current month cursor |

## Todo

```json
{
  "id": "string",
  "text": "string",
  "done": false,
  "sourceNoteId": "string|null",
  "difficulty": "하|중|상",
  "deadline": "YYYY-MM-DD|null",
  "completedAt": "ISO datetime|null",
  "createdAt": "ISO datetime",
  "updatedAt": "ISO datetime"
}
```

## Schedule Entry

```json
{
  "id": "string",
  "todoId": "string",
  "date": "YYYY-MM-DD",
  "done": false,
  "completedAt": "ISO datetime|null",
  "createdAt": "ISO datetime",
  "updatedAt": "ISO datetime"
}
```

## Sync Rules

- The mobile app only reads and writes schedule-related fields.
- Notes remain web-only in this iteration.
