export interface ProductReviewSummary {
  averageRating: number | null;
  reviewCount: number;
}

export interface ProductReview {
  id: string;
  productId: string;
  buyerId: string;
  rating: number;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorLabel: string;
}
