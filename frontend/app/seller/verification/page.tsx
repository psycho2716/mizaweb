"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createVerificationUploadUrl,
  getSellerVerificationStatus,
  submitSellerVerification,
} from "@/lib/api/endpoints";
import { sellerVerificationSchema } from "@/types";

type SellerVerificationFormValues = z.infer<typeof sellerVerificationSchema>;

export default function SellerVerificationPage() {
  const [status, setStatus] = useState("loading");
  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    formState: { isSubmitting },
  } = useForm<SellerVerificationFormValues>({
    resolver: zodResolver(sellerVerificationSchema),
    defaultValues: {
      fileName: "business-permit.pdf",
      permitFileUrl: "https://example.com/permit.pdf",
    },
  });

  useEffect(() => {
    getSellerVerificationStatus()
      .then((result) => setStatus(result.status))
      .catch(() => setStatus("unavailable"));
  }, []);

  async function handleSubmitVerification(values: SellerVerificationFormValues) {
    try {
      const result = await submitSellerVerification(values.permitFileUrl);
      setStatus(result.status);
      toast.success("Verification submitted.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit failed");
    }
  }

  async function handleGenerateUploadUrl() {
    try {
      const target = await createVerificationUploadUrl(getValues("fileName"));
      setValue("permitFileUrl", target.uploadUrl);
      toast.success(`Upload target created (${target.provider}).`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Upload URL generation failed",
      );
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Seller Verification</CardTitle>
          <CardDescription className="flex items-center gap-2">
            Current status <Badge>{status}</Badge>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(handleSubmitVerification)}>
            <div className="grid gap-2">
              <Label htmlFor="permit-file-name">File name</Label>
              <Input id="permit-file-name" {...register("fileName")} />
            </div>
            <Button type="button" variant="outline" onClick={handleGenerateUploadUrl}>
              Generate Upload URL
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="permit-url">Permit file URL</Label>
              <Input id="permit-url" {...register("permitFileUrl")} />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Verification"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
