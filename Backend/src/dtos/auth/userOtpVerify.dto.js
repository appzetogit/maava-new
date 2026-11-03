import { z } from "zod";
import { ValidationError } from "../../core/auth/errors.js";
import { normalizePlatform } from "../../utils/platform.js";

const schema = z.object({
  phone: z
    .string()
    .min(1, "Phone is required")
    .regex(/^\d+$/, "Phone must contain only digits")
    .min(8, "Phone must be at least 8 digits")
    .max(15, "Phone must be at most 15 digits"),
  otp: z
    .string()
    // 4-6 rather than exactly 6, matching the delivery and restaurant DTOs.
    // Codes issued before the switch to six digits are still sitting in the
    // database unexpired, and a hard `length(6)` would reject every customer
    // holding one -- locking out exactly the people already mid-login.
    .min(4, "OTP must be 4-6 digits")
    .max(6, "OTP must be 4-6 digits")
    .regex(/^\d{4,6}$/, "OTP must be numeric"),
  ref: z.string().trim().max(64).optional().or(z.literal("")),
  fcmToken: z.string().optional(),
  platform: z.preprocess(
    (value) => normalizePlatform(value, { allowUndefined: true }),
    z.enum(["web", "mobile"]).optional(),
  ),
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100).optional(),
});

export const validateUserOtpVerifyDto = (body) => {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0].message);
  }
  return result.data;
};
