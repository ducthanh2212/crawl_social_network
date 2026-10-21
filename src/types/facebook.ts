export interface NormalizedPost {
  id: string;
  url: string;
  authorName: string;
  authorId?: string;
  text: string;
  timestamp?: string | number;
  reactionCount: number;
  commentCount: number;
  shareCount: number;
  isSponsored?: boolean;
  rawQueryName?: string;
}

export interface NormalizedComment {
  id: string;
  authorName: string;
  authorId?: string;
  text: string;
  reactionCount: number;
  timestamp?: string | number;
  parentId?: string;
}
