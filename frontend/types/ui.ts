import type { ReactNode } from "react";

export interface GlbViewerProps {
  modelUrl: string;
}

export interface ApiResultState {
    loading: boolean;
    error: string | null;
}

export interface AuthErrorPageProps {
    searchParams: { error?: string };
}

export interface RootLayoutProps {
    children: ReactNode;
}
