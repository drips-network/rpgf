import { gql } from "graphql-request";
import { z } from "zod";
import query from "./query.ts";

export const projectChainDataSchema = z.object({
  avatar: z.union([
    z.object({
      emoji: z.string(),
    }),
    z.object({
      cid: z.string(),
    }),
  ]),
  color: z.string(),
  owner: z.object({
    address: z.string(),
  }),
});
export type ProjectChainData = z.infer<typeof projectChainDataSchema>;

export type ProjectData = ProjectChainData & {
  gitHubUrl: string;
};

export async function getProject(accountId: string, chainGqlName: string): Promise<ProjectData | null> {
  const projectQuery = gql`
    query Project {
      projectById(id: "${accountId}", chains: [${chainGqlName}]) {
        chainData {
          ... on ClaimedProjectData {
            avatar {
              ... on EmojiAvatar {
                emoji
              }
              ... on ImageAvatar {
                cid
              }
            }
            color
            owner {
              address
            }
          }
        }
        source {
          url
        }
      }
    }`;

  const res = await query(projectQuery);

  const parsed = z.object({
    projectById: z.object({
      chainData: z.array(projectChainDataSchema),
      source: z.object({
        url: z.string().url(),
      }),
    }).nullable(),
  }).parse(res);

  const chainData = parsed.projectById?.chainData[0];
  if (!chainData) {
    return null;
  }

  const gitHubUrl = parsed.projectById?.source.url;
  if (!gitHubUrl) {
    return null;
  }

  return {
    ...chainData,
    gitHubUrl,
  }
}
