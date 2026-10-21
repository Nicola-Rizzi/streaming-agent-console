import { createContext } from "react";

// Lets a question card send its answers, however deep it is rendered.
export const AnswerContext = createContext<(text: string) => void>(() => {});
