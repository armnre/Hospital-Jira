import { z } from "zod";
import { isoDate, text } from "../../common/validate";
import { CREDENTIAL_STATUSES, CREDENTIAL_TYPES } from "./credential.rules";

const fields = {
  credentialType: z.enum(CREDENTIAL_TYPES),
  credentialName: text(2, 200),
  credentialNumber: z.string().trim().max(100).regex(/^[A-Za-z0-9 ./-]*$/, "Letters, digits, space . / - only"),
  issuer: text(2, 200),
  issueDate: isoDate,
  expiryDate: isoDate.nullable(),
  documentReference: z
    .string()
    .trim()
    .max(500)
    .regex(/^[A-Za-z0-9:/._\-?=&%#+ ]*$/, "Must be a document reference or URL"),
};

export const createCredentialSchema = z
  .object({
    ...fields,
    credentialNumber: fields.credentialNumber.default(""),
    expiryDate: fields.expiryDate.optional().default(null),
    documentReference: fields.documentReference.default(""),
  })
  .strict();

export const updateCredentialSchema = z
  .object(fields)
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, "Provide at least one field to update");

export const listCredentialsQuery = z.object({
  status: z.enum(CREDENTIAL_STATUSES).optional(),
  type: z.enum(CREDENTIAL_TYPES).optional(),
  departmentId: z.coerce.number().int().positive().optional(),
  search: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export type CreateCredentialInput = z.infer<typeof createCredentialSchema>;
export type UpdateCredentialInput = z.infer<typeof updateCredentialSchema>;
export type ListCredentialsQuery = z.infer<typeof listCredentialsQuery>;
