import { z } from "zod";

export const createApplicationDtoSchema = z.object({
  projectName: z.string().min(1).max(255),
  
})