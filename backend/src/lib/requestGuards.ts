import { z } from "zod";

export function addDuplicateLineIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

export function findDuplicateIndexes(values: string[]) {
  const firstIndexByValue = new Map<string, number>();
  const duplicateIndexes: number[] = [];

  values.forEach((value, index) => {
    const normalized = value.trim();
    if (!normalized) {
      return;
    }

    if (firstIndexByValue.has(normalized)) {
      duplicateIndexes.push(index);
      return;
    }

    firstIndexByValue.set(normalized, index);
  });

  return duplicateIndexes;
}
