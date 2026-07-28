import { describe, expect, it, vi } from "vitest";
import {
  ClassroomDomainInputError,
  normalizeClassroomDomain,
  PUBLIC_EMAIL_DOMAIN_SOURCE,
  PUBLIC_EMAIL_DOMAINS,
  processClassroomAutoJoinEvent
} from "../server/classroom-domain.js";

describe("Verified Classroom Domains", () => {
  it("normalizes a school domain and rejects public mailbox providers", () => {
    expect(normalizeClassroomDomain(" School.Example ")).toBe(
      "school.example"
    );
    expect(() => normalizeClassroomDomain("gmail.com")).toThrow(
      ClassroomDomainInputError
    );
    expect(() => normalizeClassroomDomain("fastmail.com")).toThrow(
      ClassroomDomainInputError
    );
    for (const provider of [
      "gmx.de",
      "mailfence.com",
      "tuta.io",
      "yahoo.co.uk"
    ]) {
      expect(() => normalizeClassroomDomain(provider)).toThrow(
        ClassroomDomainInputError
      );
    }
    expect(PUBLIC_EMAIL_DOMAINS.size).toBeGreaterThanOrEqual(13_000);
    expect(PUBLIC_EMAIL_DOMAIN_SOURCE).toMatchObject({
      package: "free-email-domains",
      version: "1.9.77",
      tarballDatasetSha256:
        "79781188a9fceeca1e764cae1d715e8d521a10cb9ca88d9d40f333c889182879"
    });
    for (const supplement of PUBLIC_EMAIL_DOMAIN_SOURCE.reviewedSupplements) {
      expect(PUBLIC_EMAIL_DOMAINS.has(supplement)).toBe(true);
    }
    expect(() => normalizeClassroomDomain("not a domain")).toThrow(
      ClassroomDomainInputError
    );
  });

  it("requests a Clerk Student Membership for a verified matching user", async () => {
    const store = {
      classroomForDomain: vi.fn(async () => "org_class_1")
    };
    const provider = {
      autoJoinStudent: vi.fn(async () => ({
        created: true,
        membershipId: "orgmem_student_1"
      }))
    };

    await expect(
      processClassroomAutoJoinEvent(
        { store, provider },
        {
          eventType: "user.created",
          payload: {
            id: "user_student_1",
            emailDomain: "school.example",
            occurredAt: 1750000000123
          }
        }
      )
    ).resolves.toEqual({
      action: "org.autojoin",
      applied: true,
      resource: {
        type: "classroom_membership",
        id: "orgmem_student_1"
      },
      metadata: {
        classroomId: "org_class_1",
        userId: "user_student_1"
      }
    });
    expect(provider.autoJoinStudent).toHaveBeenCalledWith({
      classroomId: "org_class_1",
      userId: "user_student_1"
    });
  });

  it("leaves unmatched users in Personal Play and treats repeat Memberships as no-ops", async () => {
    const unmatchedProvider = { autoJoinStudent: vi.fn() };
    await expect(
      processClassroomAutoJoinEvent(
        {
          store: { classroomForDomain: vi.fn(async () => null) },
          provider: unmatchedProvider
        },
        {
          eventType: "user.updated",
          payload: {
            id: "user_student_1",
            emailDomain: "unmatched.example",
            occurredAt: 1750000000123
          }
        }
      )
    ).resolves.toBeNull();
    expect(unmatchedProvider.autoJoinStudent).not.toHaveBeenCalled();

    await expect(
      processClassroomAutoJoinEvent(
        {
          store: {
            classroomForDomain: vi.fn(async () => "org_class_1")
          },
          provider: {
            autoJoinStudent: vi.fn(async () => ({
              created: false,
              membershipId: "orgmem_existing"
            }))
          }
        },
        {
          eventType: "user.updated",
          payload: {
            id: "user_student_1",
            emailDomain: "school.example",
            occurredAt: 1750000000123
          }
        }
      )
    ).resolves.toMatchObject({ applied: false });
  });
});
