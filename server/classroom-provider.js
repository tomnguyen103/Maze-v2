import { createClerkClient } from "@clerk/express";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{
 *   createClient?: (options: { secretKey: string }) => {
 *     users: {
 *       getUser: (userId: string) => Promise<{
 *         primaryEmailAddressId?: string | null,
 *         emailAddresses?: {
 *           id?: string,
 *           emailAddress?: string,
 *           verification?: { status?: string } | null
 *         }[]
 *       }>
 *     },
 *     organizations: {
 *       createOrganization: (input: {
 *         name: string,
 *         createdBy: string
 *       }) => Promise<{ id: string, name: string }>,
 *       createOrganizationInvitation: (input: {
 *         organizationId: string,
 *         emailAddress: string,
 *         role: "org:member",
 *         inviterUserId: string,
 *         redirectUrl: string
 *       }) => Promise<{
 *         id: string,
 *         emailAddress: string,
 *         status?: string,
 *         url?: string | null
 *       }>
 *       createOrganizationMembership: (input: {
 *         organizationId: string,
 *         userId: string,
 *         role: "org:member"
 *       }) => Promise<{ id: string }>,
 *       getOrganizationMembershipList: (input: {
 *         organizationId: string,
 *         userId: string[],
 *         limit: number
 *       }) => Promise<{ data: { id: string }[], totalCount: number }>
 *     }
 *   }
 * }} [dependencies]
 */
export function createClassroomProvider(
  env,
  { createClient = createClerkClient } = {}
) {
  if (!env.CLERK_SECRET_KEY) {
    return null;
  }
  const clerk = createClient({ secretKey: env.CLERK_SECRET_KEY });
  return {
    /**
     * @param {{ name: string, creatorUserId: string }} input
     */
    async createClassroom({ name, creatorUserId }) {
      const organization = await clerk.organizations.createOrganization({
        name,
        createdBy: creatorUserId
      });
      return {
        id: organization.id,
        name: organization.name
      };
    },

    /**
     * @param {{
     *   classroomId: string,
     *   emailAddress: string,
     *   inviterUserId: string,
     *   redirectUrl: string
     * }} input
     */
    async inviteStudent({
      classroomId,
      emailAddress,
      inviterUserId,
      redirectUrl
    }) {
      const invitation =
        await clerk.organizations.createOrganizationInvitation({
          organizationId: classroomId,
          emailAddress,
          role: "org:member",
          inviterUserId,
          redirectUrl
        });
      return {
        id: invitation.id,
        emailAddress: invitation.emailAddress,
        status: invitation.status ?? "pending",
        url: invitation.url ?? null
      };
    },

    /** @param {string} userId */
    async verifiedPrimaryEmail(userId) {
      const user = await clerk.users.getUser(userId);
      const primary = user.emailAddresses?.find(
        (email) => email.id === user.primaryEmailAddressId
      );
      return primary?.verification?.status === "verified" &&
        typeof primary.emailAddress === "string"
        ? primary.emailAddress.trim().toLowerCase()
        : null;
    },

    /**
     * @param {{ classroomId: string, userId: string }} input
     */
    async autoJoinStudent({ classroomId, userId }) {
      const existing = await existingMembership(
        clerk,
        classroomId,
        userId
      );
      if (existing) {
        return { created: false, membershipId: existing.id };
      }
      try {
        const membership =
          await clerk.organizations.createOrganizationMembership({
            organizationId: classroomId,
            userId,
            role: "org:member"
          });
        return { created: true, membershipId: membership.id };
      } catch (error) {
        // A concurrent verified user delivery can win between the lookup and
        // create. Re-read once: an existing Membership makes the operation
        // idempotently successful; otherwise preserve the Clerk error for the
        // durable inbox retry.
        const raced = await existingMembership(clerk, classroomId, userId);
        if (raced) {
          return { created: false, membershipId: raced.id };
        }
        throw error;
      }
    }
  };
}

/**
 * @param {{
 *   organizations: {
 *     getOrganizationMembershipList: (input: {
 *       organizationId: string,
 *       userId: string[],
 *       limit: number
 *     }) => Promise<{ data: { id: string }[] }>
 *   }
 * }} clerk
 * @param {string} classroomId
 * @param {string} userId
 */
async function existingMembership(clerk, classroomId, userId) {
  const memberships =
    await clerk.organizations.getOrganizationMembershipList({
      organizationId: classroomId,
      userId: [userId],
      limit: 1
    });
  return memberships.data[0] ?? null;
}
