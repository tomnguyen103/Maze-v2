# 0032: Keep Question Narration on the Explorer's device

- Status: Accepted
- Date: 2026-07-29

## Context

Question Narration speaks child-facing reviewed learning content. The Web Speech
API permits a user agent's default voice to use either a local or remote speech
service, while `SpeechSynthesisVoice.localService` distinguishes locally
supplied voices. Silently accepting a remote default would make the product's
data boundary depend on browser configuration.

## Decision

Question Narration may use only a browser voice whose `localService` value is
`true`. Echo Maze does not send Question, choice, Hint, feedback, or Echo Lens
text to a remote narration API and never silently falls back to a remote browser
voice.

If no suitable local voice exists for the content language, **Read Aloud**
remains visibly unavailable with a concise explanation. The exact reviewed text
stays visible and screen-reader accessible, and gameplay remains fully usable.
No microphone, recording, speech recognition, or voice-answer path exists.

Narration is always initiated by an explicit **Read Aloud** action for the
currently visible Question, choices, Hint, feedback, or eligible Echo Lens.
Nothing speaks automatically when content opens or changes. The Explorer may
pause, resume, repeat, or stop; closing or replacing the source content cancels
speech immediately. Question Narration is independent from game Sound, and its
use never enters or alters answer outcomes.

Narration offers Standard, Slower, and Faster pace choices. The pace follows
ADR 0031's local/cloud Explorer Access Settings rules. The selected local voice
is remembered only on the current device. If it disappears, narration may fall
back to another suitable local voice; it never falls back to a remote voice.
There is no setting that automatically reads all content.

## Consequences

- Reviewed learning content stays within the app and the Explorer's local speech
  service.
- Narration availability and voice quality vary by installed device voices.
- A missing local voice causes an honest text-only fallback rather than a
  privacy downgrade.
- Explorers can disable game sounds without losing access to reviewed text.
- Narration pace follows a signed-in Explorer while device voice selection does
  not.
- Browser and end-to-end tests must cover local voice, remote-only voice, empty
  voice list, delayed voice discovery, unsupported API, cancellation, and
  language mismatch.
