import { z } from "zod";

export const SearchIntentSchema = z.object({
  rawQuery: z.string().min(1),
  keywords: z.array(z.string()).default([]),
  fullTextQuery: z.string().default(""),
  causeOfAction: z.string().default(""),
  caseName: z.string().default(""),
  caseNo: z.string().default(""),
  courtName: z.string().default(""),
  legalBasis: z.array(z.string()).default([]),
  courtLevel: z.enum(["基层法院", "中级法院", "高级法院", "最高法院", "未指定"]).default("未指定"),
  caseType: z.enum(["民事", "刑事", "行政", "执行", "国家赔偿", "未指定"]).default("未指定"),
  region: z.string().default(""),
  dateRange: z.object({
    start: z.string().default(""),
    end: z.string().default("")
  }).default({ start: "", end: "" }),
  partyRole: z.string().default(""),
  requestedCount: z.number().int().positive().max(20).default(5),
  sortBy: z.enum(["相关度", "裁判日期"]).default("相关度"),
  ambiguities: z.array(z.string()).default([]),
  searchPlan: z.array(z.string()).default([]),
  recommendedAdvancedFields: z.array(z.string()).default([])
});

export const RetrievalOutputSchema = z.object({
  status: z.enum(["ok", "needs_human", "error"]),
  intent: SearchIntentSchema,
  resultUrl: z.string().default(""),
  nextAction: z.string().default(""),
  notes: z.array(z.string()).default([])
});
