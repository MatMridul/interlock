// The judge access code lives in this tab's sessionStorage only: gone when the tab closes, never in localStorage,
// never rendered. It is sent in the X-Judge-Code header on requests that can reach the real model.
const KEY = "interlock.judge";

const store = (): Storage | null => {
  try { return typeof sessionStorage === "undefined" ? null : sessionStorage; } catch { return null; }
};

export const getJudgeCode = (): string => store()?.getItem(KEY) ?? "";
export const setJudgeCode = (code: string) => { try { store()?.setItem(KEY, code); } catch { /* private mode: the code is asked again */ } };
export const clearJudgeCode = () => { try { store()?.removeItem(KEY); } catch { /* nothing stored */ } };

/** Headers for a model request: the code when this tab has one. */
export const judgeHeaders = (): Record<string, string> => {
  const c = getJudgeCode();
  return c ? { "X-Judge-Code": c } : {};
};
