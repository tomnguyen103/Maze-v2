# Design - Echo Maze

A locked design system for the Echo Maze app. Gameplay function carries the
page; decoration stays secondary to reading, movement, and Warden Challenges.

## Genre

Playful storybook expedition with tactile field-guide controls.

## Macrostructure family

- App pages: Workbench. Quest status supports the central Labyrinth.
- Dialogs: Focused encounter. One decision per view with no competing actions.
- Records: Compact field notes. Outcomes remain scannable on narrow screens.

## Theme

- Paper: warm daylight
- Ink: deep navy
- Accent: electric pear
- Exploration: sea-glass cyan
- Danger: coral red
- Success: leaf green

All colors come from `tokens.css`. Raw color values do not belong in components.

## Typography

- Display: Bricolage Grotesque Variable, upright, 700-780
- Body: Geist Variable, 450-700
- Utility: Geist Mono Variable, 600-700
- Body copy starts at 16px in decision-heavy dialogs.

## Spacing

Use the 4-point scale in `tokens.css`. Interactive targets are at least 44 by
44 pixels with at least 8 pixels between adjacent targets.

## Motion

- Movement feedback: short transform-only press.
- Warden contact: one focused recoil and dialog reveal.
- Correct answer: one quiet success transition.
- Reduced motion: no spatial motion, 150ms or faster opacity change.

## Microinteractions stance

- Every action has hover, focus, active, disabled, loading, error, and success
  treatment where the state applies.
- Feedback is immediate and encouraging, never shaming.
- No timer appears inside a Warden Challenge.

## CTA voice

- Primary: solid electric pear, short verb phrase.
- Secondary: paper fill with navy outline.
- Answer choices: large full-width targets labeled by their content.

## What pages MUST share

- Workbench structure, warm daylight paper, and electric pear accent.
- Display, body, and utility type roles.
- Two-pixel navy outlines and the existing compact radius system.
- Plain, kid-friendly vocabulary and visible keyboard focus.

## What pages MAY differ on

- Quest-Level cards may use exploration, Echo, or success tints.
- Warden Challenges may use coral as semantic danger feedback.
- Results may emphasize success or recovery based on the Run outcome.

## Exports

`tokens.css` is the canonical export. Existing projects should import it before
page styles and consume named variables only.
