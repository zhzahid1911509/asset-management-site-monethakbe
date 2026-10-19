import { Inngest } from "inngest";
export const inngest = new Inngest({
  id: "monethakbe",
  // Separate steps keep database/Resend work inside a single bounded invocation.
  checkpointing: false,
  fetch: (input, init) => fetch(input, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
  }),
});
