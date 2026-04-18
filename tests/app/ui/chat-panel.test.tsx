import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { ChatPanel } from "@/app/ui/chat-panel";

describe("ChatPanel", () => {
  it("renders answer and source labels after sending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answer: "You should revise Week 4 first.",
            sources: [
              {
                id: "file-1",
                label: "CS3235 · file · Week 4 Slides.pdf",
                moduleCode: "CS3235",
                sourceType: "file",
                similarity: 0.91,
                excerpt: "Week 4 focuses on format strings.",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    render(
      <ChatPanel
        activeModule="CS3235"
        moduleId="module-1"
        suggestedPrompts={["What should I revise?"]}
        initialMessages={[{ id: "assistant-1", role: "assistant", content: "Ask me anything." }]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Ask about a lecture/i), {
      target: { value: "What should I revise?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("You should revise Week 4 first.")).toBeInTheDocument());
    expect(screen.getByText("CS3235 · file · Week 4 Slides.pdf")).toBeInTheDocument();
  });

  it("resets messages and sources when the chat scope changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            answer: "Review the Week 4 slides first.",
            sources: [
              {
                id: "file-1",
                label: "CS3235 · file · Week 4 Slides.pdf",
                moduleCode: "CS3235",
                sourceType: "file",
                similarity: 0.91,
                excerpt: "Week 4 focuses on format strings.",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    const { rerender } = render(
      <ChatPanel
        activeModule="CS3235"
        moduleId="module-1"
        suggestedPrompts={["What should I revise?"]}
        initialMessages={[{ id: "assistant-1", role: "assistant", content: "Ask me anything." }]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Ask about a lecture/i), {
      target: { value: "What should I revise?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("Review the Week 4 slides first.")).toBeInTheDocument());
    expect(screen.getByText("CS3235 · file · Week 4 Slides.pdf")).toBeInTheDocument();

    rerender(
      <ChatPanel
        activeModule="IS4231"
        moduleId="module-2"
        suggestedPrompts={["Summarise the latest announcement."]}
        initialMessages={[{ id: "assistant-2", role: "assistant", content: "Ask about IS4231." }]}
      />,
    );

    expect(await screen.findByText("Ask about IS4231.")).toBeInTheDocument();
    expect(screen.queryByText("Review the Week 4 slides first.")).not.toBeInTheDocument();
    expect(screen.queryByText("CS3235 · file · Week 4 Slides.pdf")).not.toBeInTheDocument();
  });

  it("retries without duplicating the failed user message", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response("upstream error", { status: 500 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              answer: "The quiz is next Thursday.",
              sources: [],
            }),
            { status: 200 },
          ),
        ),
    );

    render(
      <ChatPanel
        activeModule="CS3235"
        moduleId="module-1"
        suggestedPrompts={[]}
        initialMessages={[{ id: "assistant-1", role: "assistant", content: "Ask me anything." }]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/Ask about a lecture/i), {
      target: { value: "When is the quiz?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Chat failed.")).toBeInTheDocument();
    expect(screen.getAllByText("When is the quiz?")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("The quiz is next Thursday.")).toBeInTheDocument();
    expect(screen.getAllByText("When is the quiz?")).toHaveLength(1);
  });
});
