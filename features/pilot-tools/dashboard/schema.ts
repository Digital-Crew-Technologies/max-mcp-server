import { z } from "zod";
import { withToken } from "../shared";

export const getDashboardKpisSchema = z.object({ ...withToken });
