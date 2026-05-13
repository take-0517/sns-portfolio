"use client";

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { type Session } from '@supabase/supabase-js';
import Link from 'next/link';
import toast from 'react-hot-toast';

type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

export default function ChatPage() {
  const params = useParams();
  const receiverId = params.id as string;

  const [session, setSession] = useState<Session | null>(null);
  const [receiverProfile, setReceiverProfile] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        fetchReceiverProfile();
        fetchMessages(session.user.id);
        cleanup = setupRealtimeSubscription(session.user.id);
      }
    });

    // コンポーネントが破棄される時（または再描画時）に通信を明示的に切断する
    return () => {
      if (cleanup) cleanup();
    };
  }, [receiverId]);

  // 新しいメッセージが来たら一番下まで自動スクロール
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchReceiverProfile = async () => {
    const { data } = await supabase.from('profiles').select('*').eq('id', receiverId).single();
    if (data) setReceiverProfile(data);
  };

  const fetchMessages = async (currentUserId: string) => {
    // 自分と相手のメッセージを両方取得して時系列順に並べる
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${receiverId}),and(sender_id.eq.${receiverId},receiver_id.eq.${currentUserId})`)
      .order('created_at', { ascending: true });

    if (!error && data) setMessages(data);
  };

  const setupRealtimeSubscription = (currentUserId: string) => {
    // チャンネル名が重複しないようにユニークな名前をつける
    const channelId = `chat_${currentUserId}_${receiverId}_${Date.now()}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}` // 自分宛てのメッセージのみ監視
      }, (payload) => {
        const newMessage = payload.new as Message;
        // 開いている相手からのメッセージなら画面に追加
        if (newMessage.sender_id === receiverId) {
          setMessages(prev => [...prev, newMessage]);
        }
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); }
  };

  const handleSendMessage = async () => {
    if (inputText.trim() === "" || !session) return;

    const newMessage = {
      sender_id: session.user.id,
      receiver_id: receiverId,
      content: inputText
    };

    // 画面に即座に反映（ユーザーを待たせない工夫）
    const tempMessage = { ...newMessage, id: Date.now().toString(), created_at: new Date().toISOString() };
    setMessages(prev => [...prev, tempMessage as Message]);
    setInputText("");

    const { error } = await supabase.from('messages').insert([newMessage]);
    if (error) {
      toast.error("送信に失敗しました");
      fetchMessages(session.user.id); // 失敗したら本来のDBデータで画面を元に戻す
    }
  };

  if (!session) return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">ログインしてください</div>;

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans flex flex-col h-screen">
      <div className="max-w-2xl mx-auto w-full flex-1 flex flex-col h-[90vh] bg-gray-900 border border-gray-800 rounded-xl overflow-hidden shadow-2xl">
        
        {/* チャットヘッダー */}
        <div className="bg-gray-950 p-4 border-b border-gray-800 flex items-center gap-4">
          <Link href={`/profile/${receiverId}`} className="text-gray-400 hover:text-white transition-colors text-xl font-bold">
            ←
          </Link>
          <div className="flex items-center gap-3">
            {receiverProfile?.avatar_url ? (
              <img src={receiverProfile.avatar_url} alt="avatar" className="w-10 h-10 rounded-full object-cover border border-gray-700" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold shadow-md">
                {receiverProfile?.display_name?.charAt(0).toUpperCase() || "?"}
              </div>
            )}
            <h1 className="font-bold text-lg">{receiverProfile?.display_name || "名無しユーザー"}</h1>
          </div>
        </div>

        {/* チャット履歴 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <p className="text-center text-gray-500 mt-10">メッセージのやり取りはまだありません。</p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === session.user.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] p-3 rounded-2xl shadow-sm ${
                    isMine 
                      ? 'bg-emerald-600 text-white rounded-br-none' 
                      : 'bg-gray-800 text-gray-200 border border-gray-700 rounded-bl-none'
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <div className={`text-xs mt-1 opacity-70 ${isMine ? 'text-right' : 'text-left'}`}>
                      {new Date(msg.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* メッセージ入力エリア */}
        <div className="bg-gray-950 p-4 border-t border-gray-800 flex gap-2">
          <input 
            type="text" 
            value={inputText} 
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="メッセージを入力..." 
            className="flex-1 p-3 bg-gray-900 rounded-full border border-gray-700 focus:outline-none focus:border-emerald-500 text-sm"
          />
          <button 
            onClick={handleSendMessage}
            disabled={inputText.trim() === ""}
            className="w-12 h-12 shrink-0 bg-emerald-600 rounded-full flex items-center justify-center hover:bg-emerald-500 disabled:opacity-50 transition-colors shadow-md"
          >
            ➤
          </button>
        </div>

      </div>
    </main>
  );
}
