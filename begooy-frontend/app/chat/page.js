// app/chat/page.js
import Chat from "../../components/Chat"; // مسیر نسبی به جای "@/..."

export default function ChatPage() {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-[#f7f5f0]">
      <div className="w-full max-w-md">
        <Chat />
      </div>
    </main>
  );
}
