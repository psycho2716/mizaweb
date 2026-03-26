"use client";

import { useEffect, useState } from "react";
import {
  createVerificationUploadUrl,
  getSellerVerificationStatus,
  submitSellerVerification,
} from "@/lib/api/endpoints";

export default function SellerVerificationPage() {
  const [status, setStatus] = useState("loading");
  const [permitFileUrl, setPermitFileUrl] = useState(
    "https://example.com/permit.pdf",
  );
  const [fileName, setFileName] = useState("business-permit.pdf");
  const [message, setMessage] = useState("");

  useEffect(() => {
    getSellerVerificationStatus()
      .then((result) => setStatus(result.status))
      .catch(() => setStatus("unavailable"));
  }, []);

  async function handleSubmitVerification() {
    try {
      const result = await submitSellerVerification(permitFileUrl);
      setStatus(result.status);
      setMessage("Verification submitted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Submit failed");
    }
  }

  async function handleGenerateUploadUrl() {
    try {
      const target = await createVerificationUploadUrl(fileName);
      setPermitFileUrl(target.uploadUrl);
      setMessage(`Upload target created (${target.provider}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Upload URL generation failed");
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Seller Verification</h1>
      <p className="mt-3 text-sm">Current status: {status}</p>
      <label className="mt-4 block text-sm font-medium" htmlFor="permit-url">
        Permit file URL
      </label>
      <label className="mt-2 block text-sm font-medium" htmlFor="permit-file-name">
        File name
      </label>
      <input
        id="permit-file-name"
        className="mt-2 w-full rounded border p-2 text-sm"
        value={fileName}
        onChange={(event) => setFileName(event.target.value)}
      />
      <button
        type="button"
        className="mt-3 rounded border px-4 py-2 text-sm"
        onClick={handleGenerateUploadUrl}
      >
        Generate Upload URL
      </button>
      <input
        id="permit-url"
        className="mt-2 w-full rounded border p-2 text-sm"
        value={permitFileUrl}
        onChange={(event) => setPermitFileUrl(event.target.value)}
      />
      <button
        type="button"
        className="mt-3 rounded bg-zinc-900 px-4 py-2 text-sm text-white"
        onClick={handleSubmitVerification}
      >
        Submit Verification
      </button>
      <p className="mt-3 text-sm text-zinc-700">{message}</p>
    </main>
  );
}
