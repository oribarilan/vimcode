// Runs inside v1's server worker so the native question uses its real event bus.
export default {
  id: "vimcode-e2e-v1-question-server",
  async server(input: { directory: string }, options: { v1Bridge: string }) {
    return {
      async event({ event }: { event: { type: string; properties: { info?: { id: string; title: string } } } }) {
        const session = event.properties.info;
        if (event.type !== "session.created" || session?.title !== "Vimcode E2E session") return;
        const { AppRuntime, InstanceStore, Question } = await import(options.v1Bridge);
        await AppRuntime.runPromise(
          InstanceStore.Service.use((store: { provide(input: object, effect: unknown): unknown }) =>
            store.provide(
              { directory: input.directory },
              Question.Service.use((question: { ask(input: object): unknown }) =>
                question.ask({
                  sessionID: session.id,
                  questions: [{ header: "Answer", question: "Vimcode E2E question", options: [] }],
                }),
              ),
            ),
          ),
        ).catch(() => {});
      },
    };
  },
};
