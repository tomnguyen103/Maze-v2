/**
 * Fills the Journal dialog from a projection. Loaded when the Journal first renders.
 * @param {{ status: HTMLElement, clear: HTMLButtonElement, bands: HTMLElement }} parts
 * @param {string} statusText
 * @param {any} projection
 */
export function renderLanternJournal(
  { status, clear, bands },
  statusText,
  projection
) {
  status.textContent = statusText;
  clear.disabled = projection.empty;

  if (projection.empty) {
    const empty = document.createElement("div");
    const title = document.createElement("strong");
    const note = document.createElement("p");
    empty.className = "journal-empty";
    title.textContent = "Your lantern is ready.";
    note.textContent =
      "Answer, use a Hint, or skip a Warden Question to add a learning note.";
    empty.append(title, note);
    bands.replaceChildren(empty);
    return;
  }

  bands.replaceChildren(
    ...projection.bands.map((/** @type {any} */ band) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const objectives = document.createElement("div");
      section.className = "journal-band";
      heading.textContent = band.label;
      objectives.className = "journal-objectives";
      objectives.replaceChildren(
        ...band.objectives.map((/** @type {any} */ objective) => {
          const row = document.createElement("article");
          const copy = document.createElement("div");
          const title = document.createElement("h4");
          const topic = document.createElement("p");
          const counts = document.createElement("ul");
          const practice = document.createElement("button");
          row.className = "journal-objective";
          title.textContent = objective.label;
          topic.textContent = objective.topicLabel;
          counts.className = "journal-counts";
          counts.replaceChildren(
            countItem("Correct", objective.correct),
            countItem("Wrong", objective.wrong),
            countItem("Hints", objective.hint),
            countItem("Skips", objective.skip)
          );
          copy.append(title, topic, counts);
          practice.type = "button";
          practice.className = "control-button journal-practice";
          practice.textContent = "Practice";
          practice.hidden = objective.status !== "practice-ready";
          practice.dataset.practiceQuestion = objective.practiceQuestionId;
          practice.dataset.topic = objective.topicId;
          practice.dataset.objective = objective.learningObjectiveId;
          practice.dataset.band = objective.difficultyBand;
          row.append(copy, practice);
          return row;
        })
      );
      section.append(heading, objectives);
      return section;
    })
  );
}

/** @param {string} label @param {number} count */
function countItem(label, count) {
  const item = document.createElement("li");
  item.textContent = `${label} ${count}`;
  return item;
}
