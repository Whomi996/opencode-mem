export const safeArray = <T>(arr: T[] | null | undefined): T[] => arr ?? [];
export const safeObject = <T extends object>(obj: T | null | undefined, fallback: T): T =>
  obj ?? fallback;
