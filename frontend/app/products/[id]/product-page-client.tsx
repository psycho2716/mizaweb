"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

import { GlbViewer } from "@/components/products/glb-viewer";
import { backendFetchJson } from "@/lib/backend-api";
import { env } from "@/lib/env";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { CustomizationTemplateDto, ProductDetail, TemplateFieldDto } from "@/types";

interface ProductPageClientProps {
  productId: string;
}

interface JobAcceptedResponse {
  job: { id: string; status: string; created_at: string };
}

export function ProductPageClient({ productId }: ProductPageClientProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [template, setTemplate] = useState<CustomizationTemplateDto | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const [values, setValues] = useState<Record<string, string>>({});
  const [customizationId, setCustomizationId] = useState<string | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);

  const socketBase = useMemo(() => env.NEXT_PUBLIC_BACKEND_URL.replace(/\/$/, ""), []);

  const loadModelForJob = useCallback(
    async (jobId: string, token: string) => {
      const signed = await backendFetchJson<{ url: string }>(`/ai/2d-to-3d/jobs/${jobId}/model-signed-url`, {
        accessToken: token,
      });
      setModelUrl(signed.url);
      toast.success("3D preview ready.");
    },
    []
  );

  const refreshSession = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? null;
    setAccessToken(token);
    const uid = data.session?.user.id;
    if (!uid) {
      setRole(null);
      return;
    }
    const { data: prof } = await supabase.from("profiles").select("role").eq("id", uid).maybeSingle();
    setRole(typeof prof?.role === "string" ? prof.role : null);
  }, [supabase]);

  useEffect(() => {
    void refreshSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, refreshSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const prodRes = await backendFetchJson<{ product: ProductDetail }>(`/products/${productId}`);
        if (cancelled) return;
        setProduct(prodRes.product);

        const imgRes = await backendFetchJson<{ url: string }>(`/products/${productId}/primary-image-signed-url`);
        if (cancelled) return;
        setImageUrl(imgRes.url);

        try {
          const tplRes = await backendFetchJson<{ template: CustomizationTemplateDto }>(`/products/${productId}/template`);
          if (cancelled) return;
          setTemplate(tplRes.template);
          const init: Record<string, string> = {};
          for (const f of tplRes.template.schema_json.fields ?? []) {
            init[f.key] = "";
          }
          setValues(init);
        } catch {
          if (cancelled) return;
          setTemplate(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load product.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const isCustomer = role === "customer";

  const snapshotFromForm = useCallback((): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (v.trim() === "") continue;
      const n = Number(v);
      if (!Number.isNaN(n)) out[k] = n;
    }
    return out;
  }, [values]);

  const handleGuidance = async () => {
    if (!accessToken || !isCustomer) {
      toast.error("Log in as a customer to use guidance.");
      return;
    }
    try {
      const res = await backendFetchJson<{ tips: string[] }>("/guidance/recommendations", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ product_id: productId, snapshot: snapshotFromForm() }),
      });
      setTips(res.tips);
      toast.success("Updated suggestions.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Guidance failed.");
    }
  };

  const handleSaveCustomization = async () => {
    if (!accessToken || !isCustomer) {
      toast.error("Log in as a customer to save customization.");
      return;
    }
    try {
      const res = await backendFetchJson<{ customization: { id: string } }>("/customizations", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ product_id: productId, snapshot: snapshotFromForm() }),
      });
      setCustomizationId(res.customization.id);
      toast.success("Customization saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed.");
    }
  };

  useEffect(() => {
    if (!jobStatus || !accessToken) return;
    const jobIdMatch = jobStatus.match(/^listen:(.+)$/);
    if (!jobIdMatch) return;
    const jobId = jobIdMatch[1];

    const socket: Socket = io(socketBase, {
      transports: ["websocket"],
    });

    socket.emit("room:join", `job:${jobId}`);

    const onDone = async () => {
      try {
        await loadModelForJob(jobId, accessToken);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not load model URL.");
      }
      setJobStatus("completed");
    };

    socket.on("job:status", (payload: { status?: string }) => {
      if (payload?.status === "processing") {
        toast.message("Generating 3D preview…");
      }
    });
    socket.on("job:completed", () => {
      void onDone();
    });
    socket.on("job:failed", (payload: { error_message?: string }) => {
      toast.error(payload?.error_message ?? "Generation failed.");
      setJobStatus("failed");
    });

    return () => {
      socket.disconnect();
    };
  }, [jobStatus, accessToken, socketBase, loadModelForJob]);

  const handleGenerate3d = async () => {
    if (!accessToken || !isCustomer) {
      toast.error("Log in as a customer to generate a preview.");
      return;
    }
    if (!customizationId) {
      toast.error("Save your customization first.");
      return;
    }
    setModelUrl(null);
    try {
      const res = await backendFetchJson<JobAcceptedResponse>("/ai/2d-to-3d/jobs", {
        method: "POST",
        accessToken,
        body: JSON.stringify({ product_id: productId, customization_id: customizationId }),
      });
      toast.message("Job queued — waiting for updates…");

      const snapshot = await backendFetchJson<{ job: { status: string } }>(`/ai/2d-to-3d/jobs/${res.job.id}`, {
        accessToken,
      });
      if (snapshot.job.status === "completed") {
        try {
          await loadModelForJob(res.job.id, accessToken);
          setJobStatus("completed");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Could not load model URL.");
        }
      } else {
        setJobStatus(`listen:${res.job.id}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Job failed to start.");
    }
  };

  if (loading) {
    return <div className="p-8 text-zinc-600">Loading product…</div>;
  }
  if (error || !product) {
    return <div className="p-8 text-red-600">{error ?? "Product not found."}</div>;
  }

  const fields: TemplateFieldDto[] = template?.schema_json?.fields ?? [];

  return (
    <div className="min-h-screen bg-zinc-50 p-6 md:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <Link
            href={role === "customer" ? "/customer/dashboard" : "/"}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back
          </Link>
          <h1 className="text-3xl font-semibold mt-2">{product.name}</h1>
          <p className="text-zinc-500 capitalize mt-1">{product.category}</p>
          <p className="mt-2">
            <Link href={`/sellers/${product.seller_id}`} className="text-sm text-sky-700 hover:text-sky-900">
              Seller location & map →
            </Link>
          </p>
          <p className="text-zinc-700 mt-4 whitespace-pre-wrap">{product.description}</p>
        </div>

        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="w-full max-h-96 object-contain rounded-xl border border-zinc-200 bg-white" />
        ) : null}

        <div className="rounded-xl border border-zinc-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-medium">Customization</h2>
          {!template ? (
            <p className="text-sm text-zinc-600">This product does not expose a template yet.</p>
          ) : !isCustomer ? (
            <p className="text-sm text-zinc-600">Log in as a customer to customize and request a 3D preview.</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="text-zinc-700">
                      {f.key}
                      {f.required ? " *" : ""}
                      {f.unit ? ` (${f.unit})` : ""}
                    </span>
                    <input
                      type="number"
                      step="any"
                      className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  className="rounded-md bg-zinc-800 text-white px-4 py-2 text-sm"
                  onClick={() => void handleGuidance()}
                >
                  Get guidance
                </button>
                <button
                  type="button"
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
                  onClick={() => void handleSaveCustomization()}
                >
                  Save customization
                </button>
                <button
                  type="button"
                  className="rounded-md bg-emerald-700 text-white px-4 py-2 text-sm"
                  onClick={() => void handleGenerate3d()}
                >
                  Generate 3D preview
                </button>
                {customizationId ? (
                  <Link
                    href={`/customer/checkout/${customizationId}`}
                    className="inline-flex items-center rounded-md bg-sky-700 text-white px-4 py-2 text-sm"
                  >
                    Checkout
                  </Link>
                ) : null}
              </div>
            </>
          )}
        </div>

        {tips.length > 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="font-medium text-amber-950">Suggestions</h3>
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-950 space-y-1">
              {tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {modelUrl ? (
          <div className="space-y-2">
            <h2 className="text-lg font-medium">3D preview</h2>
            <GlbViewer modelUrl={modelUrl} />
          </div>
        ) : null}

        <p className="text-xs text-zinc-500">
          Backend: <span className="font-mono">{env.NEXT_PUBLIC_BACKEND_URL}</span>
        </p>
      </div>
    </div>
  );
}
