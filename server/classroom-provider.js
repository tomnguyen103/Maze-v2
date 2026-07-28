import { createClerkClient } from "@clerk/express";

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{
 *   createClient?: (options: { secretKey: string }) => {
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
    }
  };
}
