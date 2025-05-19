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

export async function getProject(accountId: string, chainGqlName: string) {
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
      }
    }`;

  const res = await query(projectQuery);

  const parsed = z.object({
    projectById: z.object({
      chainData: z.array(projectChainDataSchema),
    }).nullable(),
  }).parse(res);

  console.log({ accountId, chainGqlName, owner: parsed.projectById?.chainData[0]?.owner });

  return parsed.projectById?.chainData[0] ?? null;
}
