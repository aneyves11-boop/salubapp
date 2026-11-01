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
