import crypto from "crypto";

export const hashMsisdn = (msisdn) => {
  if (!msisdn) return null;

  return crypto
    .createHash("sha256")
    .update(String(msisdn))
    .digest("hex");
};