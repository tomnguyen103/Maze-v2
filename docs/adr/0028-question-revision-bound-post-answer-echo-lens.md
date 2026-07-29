# 0028: Bind post-answer Echo Lens content to Question revisions

- Status: Accepted
- Date: 2026-07-28

Echo Lens is available only after an answer is committed or outside a live
Warden Challenge, so the existing Question Hint remains the sole pre-answer
help. Every Lens is human-authored and bound to one immutable Reviewed Question
Revision containing the exact wording, values, choices, answer, Hint,
explanation, and metadata it explains. Editing that reviewed content creates a
new revision whose Lens must pass review independently; an objective-level
generic Lens never substitutes for missing revision-specific content.
Unsupported revisions truthfully show no Lens. This accepts higher authoring
and review cost to prevent a visual explanation from silently mismatching the
Question shown to a child.
