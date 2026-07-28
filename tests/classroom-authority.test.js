import { describe, expect, it, vi } from "vitest";
import { processClassroomAuthorityEvent } from "../server/classroom-authority.js";

describe("Classroom authority webhook processing", () => {
  it("idempotently mirrors Classroom create, update, and delete events", async () => {
    const store = {
      upsertClassroom: vi.fn(async () => true),
      deleteClassroom: vi.fn(async () => true)
    };

    await expect(
      processClassroomAuthorityEvent(store, {
        eventType: "organization.created",
        payload: {
          id: "org_classroom",
          name: "Morning Explorers",
          occurredAt: 100
        }
      })
    ).resolves.toEqual({
      action: "classroom.sync",
      applied: true,
      resource: { type: "classroom", id: "org_classroom" }
    });
    await processClassroomAuthorityEvent(store, {
      eventType: "organization.updated",
      payload: {
        id: "org_classroom",
        name: "Afternoon Explorers",
        occurredAt: 200
      }
    });
    await processClassroomAuthorityEvent(store, {
      eventType: "organization.deleted",
      payload: { id: "org_classroom", occurredAt: 300 }
    });

    expect(store.upsertClassroom).toHaveBeenNthCalledWith(1, {
      id: "org_classroom",
      name: "Morning Explorers",
      occurredAt: 100
    });
    expect(store.upsertClassroom).toHaveBeenNthCalledWith(2, {
      id: "org_classroom",
      name: "Afternoon Explorers",
      occurredAt: 200
    });
    expect(store.deleteClassroom).toHaveBeenCalledWith({
      id: "org_classroom",
      occurredAt: 300
    });
  });

  it.each([
    ["org:admin", "teacher"],
    ["org:member", "student"]
  ])("maps Clerk role %s to %s", async (clerkRole, role) => {
    const store = {
      upsertMembership: vi.fn(async () => true)
    };
    const payload = {
      id: "orgmem_student",
      classroomId: "org_classroom",
      userId: "user_student",
      role: clerkRole,
      occurredAt: 400
    };

    await processClassroomAuthorityEvent(store, {
      eventType: "organizationMembership.created",
      payload
    });

    expect(store.upsertMembership).toHaveBeenCalledWith({
      ...payload,
      role
    });
  });

  it("revokes authority for an unknown Clerk organization role", async () => {
    const store = {
      upsertMembership: vi.fn(async () => true),
      deleteMembership: vi.fn(async () => true)
    };

    await expect(
      processClassroomAuthorityEvent(store, {
        eventType: "organizationMembership.updated",
        payload: {
          id: "orgmem_student",
          classroomId: "org_classroom",
          userId: "user_student",
          role: "org:custom-power-role",
          occurredAt: 500
        }
      })
    ).resolves.toEqual({
      action: "classroom.membership.delete",
      applied: true,
      resource: { type: "classroom_membership", id: "orgmem_student" }
    });
    expect(store.upsertMembership).not.toHaveBeenCalled();
    expect(store.deleteMembership).toHaveBeenCalledWith({
      id: "orgmem_student",
      occurredAt: 500
    });
  });

  it("removes membership authority by stable Clerk membership id", async () => {
    const store = {
      deleteMembership: vi.fn(async () => true)
    };

    await expect(
      processClassroomAuthorityEvent(store, {
        eventType: "organizationMembership.deleted",
        payload: {
          id: "orgmem_student",
          classroomId: "org_classroom",
          userId: "user_student",
          role: "org:member",
          occurredAt: 600
        }
      })
    ).resolves.toEqual({
      action: "classroom.membership.delete",
      applied: true,
      resource: { type: "classroom_membership", id: "orgmem_student" }
    });
    expect(store.deleteMembership).toHaveBeenCalledWith({
      id: "orgmem_student",
      occurredAt: 600
    });
  });

  it("returns null for a verified Clerk event outside Classroom authority", async () => {
    await expect(
      processClassroomAuthorityEvent(
        {},
        { eventType: "session.created", payload: { id: "sess_1" } }
      )
    ).resolves.toBeNull();
  });
});
