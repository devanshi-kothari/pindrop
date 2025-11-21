import { useState } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

const ChatPrompt = () => {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"known" | "explore">("known");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const params = new URLSearchParams();
    params.set("message", input.trim());
    params.set("mode", mode);

    // For now both modes land in the same TripPlanning experience,
    // but the mode flag allows us to evolve separate flows later:
    // - "known": user already has a destination and wants to fill the form
    // - "explore": user wants to chat about where to go first
    navigate(`/trip/new?${params.toString()}`);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-3xl mx-auto mb-8 space-y-3">
      <div>
        <p className="text-sm text-muted-foreground">
          Start a new trip: you can jump straight into planning, or chat with the assistant
          if you&apos;re still deciding where to go.
        </p>
      </div>

      <div className="relative flex items-center">
        <Input
          type="text"
          placeholder={
            mode === "known"
              ? "What trip do you want to start planning next?"
              : "Tell me a bit about what you have in mind (dates, vibe, budget)..."
          }
          value={input}
          onChange={handleInputChange}
          className="pl-4 pr-14 h-14 rounded-full border-2 text-base focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={!input.trim()}
          className="absolute right-2 h-10 w-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white p-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
        >
          <Send className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-row flex-wrap gap-3 justify-center">
        <Button
          type="button"
          onClick={() => setMode("known")}
          aria-pressed={mode === "known"}
          className={`px-6 h-9 text-sm font-medium rounded-full border-2 transition ${
            mode === "known"
              ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-300 ring-2 ring-blue-300/80 ring-offset-2 ring-offset-background"
              : "bg-transparent hover:bg-blue-950/60 text-blue-200 border-blue-700"
          }`}
        >
          I have a destination
        </Button>
        <Button
          type="button"
          onClick={() => setMode("explore")}
          aria-pressed={mode === "explore"}
          className={`px-6 h-9 text-sm font-medium rounded-full border-2 transition ${
            mode === "explore"
              ? "bg-blue-500 hover:bg-blue-600 text-white border-blue-300 ring-2 ring-blue-300/80 ring-offset-2 ring-offset-background"
              : "bg-transparent hover:bg-blue-950/60 text-blue-200 border-blue-700"
          }`}
        >
          Help me choose
        </Button>
      </div>
    </form>
  );
};

export default ChatPrompt;

