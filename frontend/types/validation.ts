import { z } from "zod";

export const loginSchema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Password must be at least 8 characters")
});

export const buyerRegisterSchema = loginSchema.extend({
    role: z.literal("buyer")
});

export const sellerRegisterSchema = loginSchema.extend({
    role: z.literal("seller"),
    fullName: z.string().min(2, "Full name is required"),
    businessName: z.string().min(2, "Business name is required"),
    contactNumber: z.string().min(7, "Contact number is required"),
    address: z.string().min(3, "Business address is required"),
    shopLatitude: z
        .number({ error: "Drop a pin on the map for your shop" })
        .min(-90)
        .max(90),
    shopLongitude: z
        .number({ error: "Drop a pin on the map for your shop" })
        .min(-180)
        .max(180)
});

export const registerSchema = z.union([buyerRegisterSchema, sellerRegisterSchema]);

/** Seller create/edit product form (manifest + full page). */
export const sellerProductFormSchema = z
    .object({
        title: z.string().min(2, "Title is required"),
        description: z.string().min(3, "Description is required"),
        basePrice: z.number().positive("Price must be positive"),
        madeToOrder: z.boolean(),
        stockQuantity: z.number().int().min(0).optional(),
        isFeatured: z.boolean(),
        /** Set by UI when a 3D model exists (generated draft or saved GLB); drives dimensions requirement. */
        dimensionsRequiredFor3d: z.boolean().optional(),
        dimensionsText: z.string().optional(),
        colorsText: z.string().optional()
    })
    .superRefine((data, ctx) => {
        if (!data.madeToOrder && data.stockQuantity === undefined) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Stock is required when the product is not made to order",
                path: ["stockQuantity"]
            });
        }
        if (data.dimensionsRequiredFor3d === true) {
            const dims = (data.dimensionsText ?? "")
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            if (dims.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: "Add at least one dimension for the 3D picker",
                    path: ["dimensionsText"]
                });
            }
        }
    });

/** @deprecated Use sellerProductFormSchema */
export const createListingSchema = sellerProductFormSchema;

export type SellerProductFormValues = z.infer<typeof sellerProductFormSchema>;
