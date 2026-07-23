# IronLog

IronLog records strength workouts and tracks progress over time. An active workout stores sets, reps, weight, and rest time. Once finished, its data appears in the training history, progress charts, and personal records.

[Open IronLog](https://ironlog-coach.vercel.app)

![IronLog on desktop](docs/screenshots/app/desktop-showcase.png)

![IronLog on mobile](docs/screenshots/app/mobile-showcase.png)

## Training

Start an empty workout or use a saved template. IronLog shows the previous result for each exercise, keeps the active session available after a refresh, and includes a rest timer between sets.

Before training, a short readiness check records sleep, energy, stress, and soreness.

## Progress

Completed workouts are stored with their exercises and sets. The progress view covers the last 30 or 90 days and tracks training volume, frequency, muscle groups, and personal records.

Weights are stored in kilograms. The display unit can be changed to pounds in the user profile.

## Exercises and templates

IronLog includes a built-in exercise catalog. Custom exercises are stored separately from it.

Templates keep exercise order, targets, and notes for repeatable sessions. A template can be edited later or used as the starting point for a new workout.

## AI Coach

AI Coach answers questions about training and can draft a workout plan from the user's profile, readiness, recent sessions, and records. The draft can be edited before it is saved as a template.

The integration uses the user's own Claude API key. The key stays in local browser storage and is sent to the server only for the current request. IronLog does not store it in the training database.
