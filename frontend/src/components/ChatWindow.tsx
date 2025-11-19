import { useState, useRef, useEffect } from "react";
import { Send, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getApiUrl } from "@/lib/api";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface ChatWindowProps {
  className?: string;
  tripId?: number | null;
  initialMessage?: string | null;
  onTripCreated?: (tripId: number) => void;
}

const ChatWindow = ({ className = "", tripId = null, initialMessage = null, onTripCreated }: ChatWindowProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isCreatingTrip, setIsCreatingTrip] = useState(false);
  const [hasSentInitialMessage, setHasSentInitialMessage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Debug logging
  console.log('ChatWindow render:', { tripId, initialMessage, hasSentInitialMessage, isLoadingHistory, isLoading });

  // Get authentication token from localStorage
  const getAuthToken = () => {
    return localStorage.getItem("token");
  };

  const formatTime = () => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Load conversation history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const token = getAuthToken();
      if (!token) {
        // No token, show welcome message
        setMessages([{
          role: "assistant",
          content: "Hi! I'm your travel planning assistant. Where would you like to go or what would you like to do?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setIsLoadingHistory(false);
        return;
      }

      // For new trips with initial message, skip history loading entirely
      // (every new trip from single-line prompt has no history)
      if (initialMessage && !tripId) {
        console.log('✅ New trip with initial message, skipping history load:', initialMessage);
        const userMessage: Message = {
          role: "user",
          content: initialMessage,
          timestamp: formatTime()
        };
        setMessages([userMessage]);
        setIsLoadingHistory(false);
        console.log('✅ Initial message added to state, history loading complete');
        return;
      }

      try {
        const url = tripId
          ? getApiUrl(`api/chat/history?tripId=${tripId}`)
          : getApiUrl("api/chat/history");

        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // Convert database messages to display format
          const historyMessages: Message[] = result.messages.map((msg: { role: string; content: string; created_at?: string }) => ({
            role: msg.role as "user" | "assistant",
            content: msg.content,
            timestamp: msg.created_at
              ? new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }));

          if (historyMessages.length === 0 && !initialMessage) {
            // If no history and no initial message, show welcome message
            const welcomeMessage = {
              role: "assistant" as const,
              content: "Hi! I'm your travel planning assistant. Where would you like to go or what would you like to do?",
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            };
            setMessages([welcomeMessage]);
          } else if (historyMessages.length > 0) {
            setMessages(historyMessages);
          }
        } else {
          // Error loading history
          setMessages([{
            role: "assistant",
            content: "Hi! I'm your travel planning assistant. Where would you like to go or what would you like to do?",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
        }
      } catch (error) {
        console.error("Error loading conversation history:", error);
        setMessages([{
          role: "assistant",
          content: "Hi! I'm your travel planning assistant. Where would you like to go or what would you like to do?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [tripId, initialMessage]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-send initial message once history is loaded
  useEffect(() => {
    console.log('Auto-send effect check:', {
      initialMessage,
      isLoadingHistory,
      hasSentInitialMessage,
      isLoading,
      tripId,
      messagesCount: messages.length,
      hasInitialMessage: messages.some(msg => msg.role === "user" && msg.content === initialMessage),
      hasAssistantResponse: messages.some(msg => msg.role === "assistant")
    });

    if (initialMessage && !isLoadingHistory && !hasSentInitialMessage && !isLoading && !tripId) {
      // Check if initial message is already in messages
      const hasInitialMessage = messages.some(msg =>
        msg.role === "user" && msg.content === initialMessage
      );

      // Check if assistant has already responded (meaning message was sent)
      const hasAssistantResponse = messages.some(msg => msg.role === "assistant");

      if (hasInitialMessage && !hasAssistantResponse) {
        // Message is displayed but not sent yet, auto-send it
        console.log('✅ Auto-sending initial message:', initialMessage);
        setHasSentInitialMessage(true); // Mark as sending to prevent duplicate triggers
        const timer = setTimeout(() => {
          console.log('✅ Executing sendMessage for initial message');
          sendMessage(initialMessage);
        }, 300);
        return () => clearTimeout(timer);
      } else if (hasAssistantResponse) {
        // Already sent and got response
        console.log('✅ Message already sent and got response');
        setHasSentInitialMessage(true);
      } else if (!hasInitialMessage) {
        console.log('⚠️ Initial message not found in messages yet, waiting...');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessage, isLoadingHistory, messages.length, isLoading, hasSentInitialMessage, tripId]);

  const sendMessage = async (messageContent?: string) => {
    const messageToSend = messageContent || inputMessage.trim();
    if (!messageToSend || isLoading) {
      console.log('sendMessage skipped:', { messageToSend, isLoading });
      return;
    }

    console.log('sendMessage called:', { messageToSend, initialMessage, tripId });

    // Mark initial message as sent if it matches
    if (initialMessage && messageToSend === initialMessage) {
      setHasSentInitialMessage(true);
    }

    const userMessage: Message = {
      role: "user",
      content: messageToSend,
      timestamp: formatTime()
    };

    // Check if message is already in state (to avoid duplicates)
    setMessages((prev) => {
      const alreadyExists = prev.some(msg =>
        msg.role === "user" && msg.content === messageToSend
      );
      if (alreadyExists) {
        console.log('Message already exists, not adding duplicate');
        return prev; // Don't add duplicate
      }
      return [...prev, userMessage];
    });
    setInputMessage("");
    setIsLoading(true);

    // Show "Creating your trip..." if no tripId and this looks like a trip request
    const isTripRequest = /want.*go|plan.*trip|visit|travel|to\s+[A-Za-z]/i.test(messageToSend);
    if (!tripId && (isTripRequest || (initialMessage && messageToSend === initialMessage))) {
      console.log('Setting isCreatingTrip to true');
      setIsCreatingTrip(true);
    }

    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error("Not authenticated. Please log in.");
      }

      const response = await fetch(getApiUrl("api/chat/chat"), {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: userMessage.content,
          tripId: tripId,
          // Conversation history is now loaded from database on backend
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Handle trip creation
        if (result.tripId && !tripId && onTripCreated) {
          onTripCreated(result.tripId);
        }

        // Add assistant response
        const assistantMessage: Message = {
          role: "assistant",
          content: result.message,
          timestamp: formatTime()
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        // Add error message
        const errorMessage: Message = {
          role: "assistant",
          content: result.message || "Sorry, I encountered an error. Please try again.",
          timestamp: formatTime()
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, I'm having trouble connecting. Please try again later.",
        timestamp: formatTime()
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsCreatingTrip(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(undefined);
    }
  };

  return (
    <div className={`flex flex-col h-full bg-blue-700 ${className}`}>
      {/* Chat Header */}
      <div className="flex items-center justify-between p-4 border-b border-blue-500 bg-blue-800/50">
        <h2 className="text-lg font-semibold text-white">Travel Assistant</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-white hover:bg-blue-600">
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4 bg-blue-700">
        <div className="space-y-4">
          {isLoadingHistory && (
            <div className="flex justify-start">
              <div className="bg-white text-foreground rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Loading conversation history...</p>
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-4 py-3 shadow-sm ${
                  message.role === "user"
                    ? "bg-teal-500 text-white"
                    : "bg-white text-foreground"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
                <p className={`text-xs mt-2 ${
                  message.role === "user" ? "text-teal-100" : "text-muted-foreground"
                }`}>
                  {message.timestamp}
                </p>
                {message.role === "user" && (
                  <div className="flex justify-end mt-1">
                    <span className="text-xs text-teal-100">✓✓</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isCreatingTrip && (
            <div className="flex justify-start">
              <div className="bg-white text-foreground rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Creating your trip...</p>
              </div>
            </div>
          )}
          {isLoading && !isCreatingTrip && (
            <div className="flex justify-start">
              <div className="bg-white text-foreground rounded-lg px-4 py-3 shadow-sm">
                <p className="text-sm">Thinking...</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-blue-500 bg-blue-800/30">
        <div className="relative flex items-center gap-2">
          <div className="absolute left-3 z-10">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-pink-500" />
          </div>
          <Input
            type="text"
            placeholder="I'd like to go on October 20th-October 30th"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            className="pl-12 pr-14 h-12 rounded-full border-2 bg-black text-white placeholder:text-gray-400 border-gray-700 focus:border-blue-400"
          />
          <Button
            type="button"
            onClick={() => sendMessage()}
            disabled={!inputMessage.trim() || isLoading}
            className="absolute right-2 h-8 w-8 rounded-full bg-blue-500 hover:bg-blue-400 text-white p-0 disabled:opacity-50 disabled:cursor-not-allowed"
            id="chat-send-button"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;

