type Context = {
  options: { directory: string };
  keymap: {
    layer(
      input: () => {
        mode: "global";
        commands: Array<{
          id: string;
          title: string;
          group: string;
          palette: true;
          bind: string;
          run(): Promise<void>;
        }>;
      },
    ): void;
  };
  ui: {
    slot(input: { append: "app"; render(): null }): () => void;
    router: { navigate(route: { type: "session"; sessionID: string }): void };
  };
  client: {
    session: {
      create(input: { title: string; location: { directory: string } }): Promise<{ id: string }>;
      form: {
        create(input: {
          sessionID: string;
          title: string;
          fields: Array<{ key: string; type: "string"; title: string; required: true }>;
        }): Promise<unknown>;
      };
    };
  };
};

type V1Api = {
  keymap: {
    registerLayer(input: {
      commands: Array<{ name: string; title: string; run(): Promise<void> }>;
      bindings: Array<{ key: string; cmd: string }>;
    }): void;
  };
  route: { navigate(name: "session", params: { sessionID: string }): void };
  client: {
    session: {
      create(
        input: { directory: string; title: string },
        options: { throwOnError: true },
      ): Promise<{ data: { id: string } }>;
    };
  };
};

// Sets up a real question without a model call or reading/mutating editor state.
export default {
  id: "vimcode-e2e-question-fixture",
  async tui(api: V1Api, options: { directory: string }) {
    api.keymap.registerLayer({
      commands: [
        {
          name: "vimcode.e2e.question",
          title: "Open synthetic question",
          async run() {
            const session = await api.client.session.create(
              { directory: options.directory, title: "Vimcode E2E session" },
              { throwOnError: true },
            );
            api.route.navigate("session", { sessionID: session.data.id });
          },
        },
      ],
      bindings: [{ key: "ctrl+g", cmd: "vimcode.e2e.question" }],
    });
  },
  setup(context: Context) {
    return context.ui.slot({
      append: "app",
      render() {
        context.keymap.layer(() => ({
          mode: "global",
          commands: [
            {
              id: "vimcode.e2e.question",
              title: "Open synthetic question",
              group: "E2E",
              palette: true,
              bind: "ctrl+g",
              async run() {
                const session = await context.client.session.create({
                  title: "Vimcode E2E session",
                  location: { directory: context.options.directory },
                });
                context.ui.router.navigate({ type: "session", sessionID: session.id });
                await context.client.session.form.create({
                  sessionID: session.id,
                  title: "Vimcode E2E question",
                  fields: [{ key: "answer", type: "string", title: "Answer", required: true }],
                });
              },
            },
          ],
        }));
        return null;
      },
    });
  },
};
