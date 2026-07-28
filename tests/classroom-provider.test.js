import { describe, expect, it, vi } from "vitest";
import { createClassroomProvider } from "../server/classroom-provider.js";

describe("Clerk Classroom provider", () => {
  it("creates an Organization with the Explorer as its first Teacher", async () => {
    const createOrganization = vi.fn(async () => ({
      id: "org_new_1",
      name: "Aurora Lab"
    }));
    const provider = createClassroomProvider(
      { CLERK_SECRET_KEY: "sk_test" },
      {
        createClient: () => ({
          organizations: {
            createOrganization,
            createOrganizationInvitation: vi.fn()
          }
        })
      }
    );

    await expect(
      provider?.createClassroom({
        name: "Aurora Lab",
        creatorUserId: "user_teacher_1"
      })
    ).resolves.toEqual({ id: "org_new_1", name: "Aurora Lab" });
    expect(createOrganization).toHaveBeenCalledWith({
      name: "Aurora Lab",
      createdBy: "user_teacher_1"
    });
  });

  it("invites a Student with the locked /class redirect", async () => {
    const createOrganizationInvitation = vi.fn(async () => ({
      id: "orginv_1",
      emailAddress: "student@example.com",
      status: "pending",
      url: "https://accounts.example.test/invitations/orginv_1"
    }));
    const provider = createClassroomProvider(
      { CLERK_SECRET_KEY: "sk_test" },
      {
        createClient: () => ({
          organizations: {
            createOrganization: vi.fn(),
            createOrganizationInvitation
          }
        })
      }
    );

    await provider?.inviteStudent({
      classroomId: "org_class_1",
      emailAddress: "student@example.com",
      inviterUserId: "user_teacher_1",
      redirectUrl: "/class"
    });
    expect(createOrganizationInvitation).toHaveBeenCalledWith({
      organizationId: "org_class_1",
      emailAddress: "student@example.com",
      role: "org:member",
      inviterUserId: "user_teacher_1",
      redirectUrl: "/class"
    });
  });

  it("is unavailable without a secret key", () => {
    expect(createClassroomProvider({})).toBeNull();
  });
});
