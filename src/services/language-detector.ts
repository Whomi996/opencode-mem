import { franc } from "franc-min";
import { iso6393, iso6393To1 } from "iso-639-3";

export function detectLanguage(text: string): string {
  if (!text || text.trim().length === 0) {
    return "en";
  }

  const detected = franc(text, { minLength: 10 });

  if (detected === "und") {
    return "en";
  }

  return iso6393To1[detected] || "en";
}

export function getLanguageName(code: string): string {
  const lang = iso6393.find((l: any) => l.iso6391 === code);
  return lang?.name || "English";
}
