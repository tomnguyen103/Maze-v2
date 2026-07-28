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
          users: { getUser: vi.fn() },
          organizations: {
            createOrganization,
            createOrganizationInvitation: vi.fn(),
            createOrganizationMembership: vi.fn(),
            getOrganizationMembershipList: vi.fn()
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
          users: { getUser: vi.fn() },
          organizations: {
            createOrganization: vi.fn(),
            createOrganizationInvitation,
            createOrganizationMembership: vi.fn(),
            getOrganizationMembershipList: vi.fn()
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

  it("returns only a verified primary email for domain registration", async () => {
    const getUser = vi.fn(async () => ({
      primaryEmailAddressId: "idn_primary",
      emailAddresses: [
        {
          id: "idn_other",
          emailAddress: "other@example.test",
          verification: { status: "verified" }
        },
        {
          id: "idn_primary",
          emailAddress: "Teacher@School.Example",
          verification: { status: "verified" }
        }
      ]
    }));
    const provider = createClassroomProvider(
      { CLERK_SECRET_KEY: "sk_test" },
      {
        createClient: () => ({
          users: { getUser },
          organizations: {
            createOrganization: vi.fn(),
            createOrganizationInvitation: vi.fn(),
            createOrganizationMembership: vi.fn(),
            getOrganizationMembershipList: vi.fn()
          }
        })
      }
    );

    await expect(
      provider?.verifiedPrimaryEmail("user_teacher_1")
    ).resolves.toBe("teacher@school.example");
    expect(getUser).toHaveBeenCalledWith("user_teacher_1");
  });

  it("creates one Clerk Student Membership and treats repeats as success", async () => {
    const getOrganizationMembershipList = vi
      .fn()
      .mockResolvedValueOnce({ data: [], totalCount: 0 })
      .mockResolvedValueOnce({
        data: [{ id: "orgmem_existing" }],
        totalCount: 1
      });
    const createOrganizationMembership = vi.fn(async () => ({
      id: "orgmem_created"
    }));
    const provider = createClassroomProvider(
      { CLERK_SECRET_KEY: "sk_test" },
      {
        createClient: () => ({
          users: { getUser: vi.fn() },
          organizations: {
            createOrganization: vi.fn(),
            createOrganizationInvitation: vi.fn(),
            createOrganizationMembership,
            getOrganizationMembershipList
          }
        })
      }
    );

    await expect(
      provider?.autoJoinStudent({
        classroomId: "org_class_1",
        userId: "user_student_1"
      })
    ).resolves.toEqual({
      created: true,
      membershipId: "orgmem_created"
    });
    await expect(
      provider?.autoJoinStudent({
        classroomId: "org_class_1",
        userId: "user_student_1"
      })
    ).resolves.toEqual({
      created: false,
      membershipId: "orgmem_existing"
    });
    expect(createOrganizationMembership).toHaveBeenCalledOnce();
    expect(createOrganizationMembership).toHaveBeenCalledWith({
      organizationId: "org_class_1",
      userId: "user_student_1",
      role: "org:member"
    });
  });

  it("is unavailable without a secret key", () => {
    expect(createClassroomProvider({})).toBeNull();
  });
});
