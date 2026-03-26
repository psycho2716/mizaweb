import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../../src/app";

describe("verification + publish restriction", () => {
  it("creates verification upload target for seller", async () => {
    const response = await request(app)
      .post("/seller/verification/upload-url")
      .set("x-user-id", "u-seller-1")
      .send({ filename: "business-permit.pdf" });

    expect(response.status).toBe(201);
    expect(typeof response.body.path).toBe("string");
    expect(typeof response.body.uploadUrl).toBe("string");
  });

  it("blocks publish when seller is unverified", async () => {
    const createResponse = await request(app)
      .post("/products")
      .set("x-user-id", "u-seller-1")
      .send({
        title: "Stone Slab A",
        description: "Premium slab",
        basePrice: 1200,
      });

    expect(createResponse.status).toBe(201);
    const productId = createResponse.body.id as string;

    const publishResponse = await request(app)
      .post(`/products/${productId}/publish`)
      .set("x-user-id", "u-seller-1")
      .send({});

    expect(publishResponse.status).toBe(403);
  });

  it("allows publish after admin approval", async () => {
    const verificationResponse = await request(app)
      .post("/seller/verification/submit")
      .set("x-user-id", "u-seller-1")
      .send({
        permitFileUrl: "https://example.com/permit.pdf",
      });

    expect(verificationResponse.status).toBe(201);
    const verificationId = verificationResponse.body.id as string;

    const approveResponse = await request(app)
      .post(`/admin/verifications/${verificationId}/approve`)
      .set("x-user-id", "u-admin-1")
      .send({});
    expect(approveResponse.status).toBe(200);

    const createResponse = await request(app)
      .post("/products")
      .set("x-user-id", "u-seller-1")
      .send({
        title: "Stone Slab B",
        description: "Premium slab approved",
        basePrice: 1800,
      });
    expect(createResponse.status).toBe(201);
    const productId = createResponse.body.id as string;

    const publishResponse = await request(app)
      .post(`/products/${productId}/publish`)
      .set("x-user-id", "u-seller-1")
      .send({});

    expect(publishResponse.status).toBe(200);
  });
});
