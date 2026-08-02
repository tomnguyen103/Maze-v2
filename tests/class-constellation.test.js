import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  CLASS_CONSTELLATION_MARKER_THRESHOLD,
  CLASS_CONSTELLATION_PUBLISH_THRESHOLD,
  projectClassConstellation
} from "../shared/class-constellation.js";
import {
  createClassroomHandler,
  isClassroomPath
} from "../server/classroom-route.js";

const migrationUrl = new URL(
  "../db/migrations/0029_class_expedition_constellation.sql",
  import.meta.url
);

function markers(counts) {
  return counts.map((contributorCount, index) => ({
    labyrinthNumber: index + 1,
    contributorCount
  }));
}

describe("Class Constellation projection", () => {
  it("reuses the Daily publication and marker thresholds", () => {
    expect(CLASS_CONSTELLATION_PUBLISH_THRESHOLD).toBe(20);
    expect(CLASS_CONSTELLATION_MARKER_THRESHOLD).toBe(5);
  });

  it("keeps the projection forming below 20 distinct escaped Students", () => {
    expect(
      projectClassConstellation({
        escapedStudentCount: 19,
        markers: markers([19, 19, 19, 19])
      })
    ).toEqual({ published: false, markers: [] });
  });

  it("suppresses milestones below five and returns bands without counts", () => {
    const projection = projectClassConstellation({
      escapedStudentCount: 20,
      markers: markers([4, 5, 8, 20])
    });

    expect(projection).toEqual({
      published: true,
      markers: [
        { labyrinthNumber: 2, band: "quiet" },
        { labyrinthNumber: 3, band: "glowing" },
        { labyrinthNumber: 4, band: "bright" }
      ]
    });
    expect(JSON.stringify(projection)).not.toMatch(
      /count|percent|student|user|run|answer|prompt|timestamp|route|rank|diagnos/i
    );
  });

  it("cannot reconstruct a Student route from the fixed milestone shape", () => {
    const first = projectClassConstellation({
      escapedStudentCount: 20,
      markers: markers([5, 7, 9, 11])
    });
    const sameCountsDifferentStudents = projectClassConstellation({
      escapedStudentCount: 20,
      markers: markers([5, 7, 9, 11]).map((marker, index) => ({
        ...marker,
        knownStudentIds: [`user_other_${index}`]
      }))
    });

    expect(first.markers).toHaveLength(4);
    expect(sameCountsDifferentStudents.markers).toEqual(first.markers);
    expect(first.markers.every((marker) => Object.keys(marker).sort().join() === "band,labyrinthNumber")).toBe(true);
  });
});

describe("Class Constellation route and migration boundary", () => {
  it("recognizes only the authenticated Classroom constellation route", () => {
    expect(
      isClassroomPath(
        "/api/classrooms/org_class_1/expeditions/exped_abc123/constellation"
      )
    ).toBe(true);
    expect(isClassroomPath("/api/classrooms/org_class_1/constellation")).toBe(
      false
    );
  });

  it("returns the projection and never the reader's aggregate counts", async () => {
    const constellationForExpedition = vi.fn(async () => ({
      published: true,
      markers: [
        { labyrinthNumber: 1, band: "quiet" },
        { labyrinthNumber: 4, band: "bright" }
      ]
    }));
    const handler = createClassroomHandler({
      store: {
        requireTeacher: vi.fn(async () => "teacher"),
        constellationForExpedition
      },
      provider: null,
      getUserId: () => "user_teacher_1"
    });
    const server = createServer((request, response) =>
      handler(request, response)
    );
    await new Promise((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve(undefined))
    );
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not start.");
    }
    try {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/api/classrooms/org_class_1/expeditions/exped_abc123/constellation`
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        constellation: {
          published: true,
          markers: [
            { labyrinthNumber: 1, band: "quiet" },
            { labyrinthNumber: 4, band: "bright" }
          ]
        }
      });
      expect(JSON.stringify(body)).not.toMatch(
        /count|percent|student|user|run|answer|prompt|timestamp|route|rank|diagnos/i
      );
      expect(constellationForExpedition).toHaveBeenCalledWith(
        "user_teacher_1",
        "org_class_1",
        "exped_abc123"
      );
    } finally {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve(undefined)))
      );
    }
  });

  it("pins the migration to the Teacher, threshold, and no-route boundary", async () => {
    const sql = (await readFile(migrationUrl, "utf8")).replaceAll(
      "\r\n",
      "\n"
    );
    const statements = sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

    expect(sql).toContain("Apply with DATABASE_ADMIN_URL after migration 0028");
    expect(sql).toContain("CREATE FUNCTION read_class_expedition_constellation");
    expect(statements).toContain("COUNT(DISTINCT grants.clerk_user_id)");
    expect(statements).toContain("completed_count >= 5");
    expect(statements).toContain("escaped_student_count >= 20");
    expect(statements).toContain("role = 'teacher'");
    expect(statements).toContain("SECURITY DEFINER");
    expect(statements).toContain("SET search_path = pg_catalog, public");
    expect(statements).toContain("REVOKE ALL ON FUNCTION");
    expect(statements).not.toMatch(
      /route|action_log|answer|prompt|timestamp|username|rank/i
    );
  });
});
