import { createServerFn } from "@tanstack/react-start";
import type { AbidjanCommune } from "./abidjan";

export interface VerifiedStructureInfo {
  name: string;
  type: string;
  commune: AbidjanCommune | null;
  email?: string;
}

export const verifyStructureAccessServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      accessCode: string;
      structureName?: string;
      structureType?: string;
      commune?: string | null;
      email?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      partnerToken?: string;
      profile?: VerifiedStructureInfo;
      error?: string;
    }> => {
      const { verifyAndAccreditStructure } = await import("./structure-auth.server");
      return verifyAndAccreditStructure(data);
    }
  );

export const verifyPartnerTokenServerFn = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
  .handler(
    async ({
      data,
    }): Promise<{
      valid: boolean;
      profile?: VerifiedStructureInfo;
    }> => {
      const { verifyPartnerTokenServer } = await import("./structure-auth.server");
      const verified = verifyPartnerTokenServer(data.token);
      if (!verified) {
        return { valid: false };
      }
      return {
        valid: true,
        profile: {
          name: verified.name,
          type: verified.type,
          commune: verified.commune,
          email: verified.email,
        },
      };
    }
  );

export const verifyAdminSessionServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      accessToken?: string;
      adminToken?: string;
      adminKey?: string;
      email?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      valid?: boolean;
      adminToken?: string;
      email?: string;
      error?: string;
    }> => {
      const { authenticateOrGrantAdmin, verifyAdminTokenServer } = await import(
        "./structure-auth.server"
      );
      if (data.adminToken) {
        const verified = verifyAdminTokenServer(data.adminToken);
        if (verified.valid) {
          return { ok: true, valid: true, adminToken: data.adminToken, email: verified.email };
        }
      }
      return authenticateOrGrantAdmin(data);
    }
  );

export const generateStructureAccessCodeServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      commune?: string | null;
      accessToken?: string;
      adminToken?: string;
    }) => data
  )
  .handler(
    async ({
      data,
    }): Promise<{
      ok: boolean;
      code?: string;
      commune?: AbidjanCommune | null;
      error?: string;
    }> => {
      const { generateOfficialAccessCodeForAdmin } = await import("./structure-auth.server");
      return generateOfficialAccessCodeForAdmin(data);
    }
  );

export const getStructureSubscriptionsServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { getSubscriptionsServer, verifyAdminAccessToken } = await import(
      "./structure-auth.server"
    );
    const isAdmin = await verifyAdminAccessToken(data.accessToken, data.adminToken);
    if (!isAdmin) {
      return { ok: false, subscriptions: [], error: "Droits administrateur requis." };
    }
    const subs = await getSubscriptionsServer();
    return { ok: true, subscriptions: subs };
  });

export const reactivateSubscriptionServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      additionalDays?: number;
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { reactivateStructureSubscription } = await import("./structure-auth.server");
    return reactivateStructureSubscription(data);
  });

export const toggleSuspendSubscriptionServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { toggleSuspendStructureSubscription } = await import("./structure-auth.server");
    return toggleSuspendStructureSubscription(data);
  });

export const updateStructureFeeServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      monthlyFee: number;
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { updateStructureFee } = await import("./structure-auth.server");
    return updateStructureFee(data);
  });

export const addStructureSubscriptionServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      code: string;
      name: string;
      commune?: string | null;
      type?: string;
      monthlyFee?: number;
      contactEmail?: string;
      contactPhone?: string;
      notes?: string;
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { addStructureSubscriptionServer } = await import("./structure-auth.server");
    return addStructureSubscriptionServer(data as any);
  });

export const adminDeleteReportServerFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      reportId: string;
      adminToken?: string;
      accessToken?: string;
    }) => data
  )
  .handler(async ({ data }) => {
    const { adminDeleteReportServer } = await import("./structure-auth.server");
    return adminDeleteReportServer(data);
  });
