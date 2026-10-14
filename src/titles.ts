// Compare titles ignoring case, accents and punctuation ("Južina" = "Juzina").
export const titleKey = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

// The English title to show small under a title, or undefined when it adds nothing.
export const altTitle = (title: string, englishTitle?: string) =>
  englishTitle && titleKey(englishTitle) !== titleKey(title) ? englishTitle : undefined;
