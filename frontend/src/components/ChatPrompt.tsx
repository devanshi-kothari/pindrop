import { useState } from "react";
import { Send } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

const ChatPrompt = () => {
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      // Navigate to trip planning page with the input as initial message
      navigate(`/trip/new?message=${encodeURIComponent(input.trim())}`);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-3xl mx-auto mb-8">
      <div className="relative flex items-center">
        <Input
          type="text"
          placeholder="What trip do you want to start planning next?"
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
    </form>
  );
};

export default ChatPrompt;

