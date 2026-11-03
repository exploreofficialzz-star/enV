import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommunityFeed, getRecentCommunityDiscussions } from "./community.server";

export type PublicCommunityComment = {
  id: string;
  parentId: string | null;
  body: string;
  authorLabel: string;
  identityMode: "public" | "anonymous";
  createdAt: string;
  isMine: boolean;
};

export type PublicCommunityFeed = {
  toolId: string;
  counts: { comments: number; likes: number; dislikes: number; views: number; views30Days: number };
  myReaction: "like" | "dislike" | null;
  comments: PublicCommunityComment[];
  generatedAt: string;
};

export type PublicCommunityDiscussion = {
  toolId: string;
  toolName: string;
  category: string;
  slug: string;
  commentCount: number;
  latestAt: string;
  latestBody: string;
  latestAuthor: string;
};

export const loadPublicCommunityIndex = createServerFn({ method: "GET" }).handler(async () => {
  try {
    return await getRecentCommunityDiscussions(getRequest(), 200) as PublicCommunityDiscussion[];
  } catch {
    return [] as PublicCommunityDiscussion[];
  }
});

export const loadPublicCommunityToolFeed = createServerFn({ method: "GET" })
  .validator((input: { toolId: string }) => {
    if (typeof input.toolId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,99}$/i.test(input.toolId)) {
      throw new Error("A valid tool identifier is required.");
    }
    return input;
  })
  .handler(async ({ data }) => {
    try {
      const feed = await getCommunityFeed(getRequest(), data.toolId);
      return feed as PublicCommunityFeed;
    } catch {
      return null;
    }
  });
