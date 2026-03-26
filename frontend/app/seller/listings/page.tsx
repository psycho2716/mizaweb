"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProduct, publishProduct } from "@/lib/api/endpoints";
import { createListingSchema } from "@/types";

type CreateListingFormValues = z.infer<typeof createListingSchema>;

export default function SellerListingsPage() {
  const [latestProductId, setLatestProductId] = useState("");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<CreateListingFormValues>({
    resolver: zodResolver(createListingSchema),
    defaultValues: {
      title: "Stone Tile",
      description: "Polished stone tile",
      basePrice: 1200,
    },
  });

  async function handleCreate(values: CreateListingFormValues) {
    try {
      const response = await createProduct({
        title: values.title,
        description: values.description,
        basePrice: values.basePrice,
      });
      setLatestProductId(response.id);
      toast.success(`Created listing ${response.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    }
  }

  async function handlePublish() {
    if (!latestProductId) {
      toast.info("Create a product first.");
      return;
    }
    try {
      await publishProduct(latestProductId);
      toast.success(`Published ${latestProductId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Seller Listings</CardTitle>
          <CardDescription>Create and publish listing flow.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit(handleCreate)}>
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input id="title" {...register("title")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" {...register("description")} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="basePrice">Base price</Label>
              <Input
                id="basePrice"
                type="number"
                {...register("basePrice", { valueAsNumber: true })}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating..." : "Create Listing"}
              </Button>
              <Button type="button" variant="outline" onClick={handlePublish}>
                Publish Latest
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
